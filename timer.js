// Copyright 2019 Google LLC
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     https://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Service worker installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').then(function(registration) {
      // Registration was successful
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      // registration failed :(
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Set the name of the hidden property and the change event for visibility
var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") {
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}

let currentPage = undefined;
const settings = ['leadin', 'work', 'break', 'sets'];

function $(id) {
  return document.getElementById(id);
}

function onhashchange() {
  let selectedPage = 'page-' + (
    window.location.hash.substring(1) || 'timer');
  if (currentPage)
    $(currentPage).style.display = '';
  $(selectedPage).style.display = 'block';
  currentPage = selectedPage;
}

function hidemenu() {
  document.querySelector('.mdl-layout__obfuscator').click();
}

onhashchange();
window.addEventListener('hashchange', onhashchange);

let params = {};

function parseTime(timeVal) {
  let split = timeVal.split(':');
  let seconds = 0;
  for (let i = 0; i < split.length; i++) {
    seconds *= 60;
    seconds += parseInt(split[i]);
  }
  return seconds;
}

let curSet = {};

function reset() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  startTime = null;
  lastTicks = 0;
  document.body.className = 'ready';
  for (let param of settings) {
    curSet[param] = params[param] = parseTime($(param).value);
  }
  tick();
}

let startTime = null;
let timer = null;
let lastTicks = 0;
// A time ordered list of events
let events = [];

function now() {
  return (new Date()).getTime();
}

// TODO: Use a generator to only generate the next event instead of the full
// list up front.
function generateEvents(startTime) {
  let eventList = [];
  let seconds = 0;
  for (let i = 0; i < params.sets; i++) {

    // Only lead in to the first set.
    let startAt = (i == 0 ? 0 : 1);

    // Only include the rest if it's not the last set.
    let endAt = (i == params.sets - 1 ? 1 : 2);
    for (let j = startAt; j <= endAt; j++) {
      let curDur = params[settings[j]];

      // Only generate halfway events for workout periods.
      if (j == 1 && $('halfway').checked) {
        eventList.push({
          time: startTime + (seconds + curDur / 2) * 1000,
          mandatory: false,
          speak: 'halfway',
        });
      }

      // Countdown
      for (let k = 3; k >= 1; --k) {
        eventList.push({
          time: startTime + (seconds + curDur - k) * 1000,
          mandatory: false,
          speak: k,
        });
      }

      // Transition
      let eventText = '';
      if (j == 0 || j == 2)
        eventText = 'go';
      else if (j == 1)
        eventText = i == params.sets - 1 ? 'done' : 'switch';

      if (eventText) {
        eventList.push({
          time: startTime + (seconds + curDur) * 1000,
          mandatory: false,
          speak: eventText,
        });
      }

      seconds += curDur;
    }
  }
  return eventList;
}

function play() {
  let resumeTime = now();
  startTime = resumeTime - lastTicks * 1000;
  events = generateEvents(startTime);
  // Remove all events already passed.
  let i = 0;
  for (; i < events.length && events[i].time <= resumeTime; i++);
  events.splice(0, i);
  document.body.className = 'playing';
  scheduleUpdate();
}

function speak(text) {
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function tick() {
  timer = null;
  let curTime = now();
  scheduleUpdate(curTime)

  // Play all current audio events.
  let i = 0;
  for (;i<events.length; i++) {
    if (events[i].time > curTime + 500)
      break;

    // Skip non-mandatory event if next event is due.
    if (!events[i].mandatory &&
        i + 1 < events.length &&
        events[i + 1].time <= curTime + 500)
      continue;

    speak(events[i].speak);
  }
  events.splice(0, i);

  // Update elements
  let ticks = startTime ?
      (Math.round((curTime - startTime) / 1000) - lastTicks) : 0;
  lastTicks += ticks;
  let done = false;
  // TODO: Calculate current state rather than ticking for each second
  // passed.
  while (ticks-- > 0) {
    let ind = 0;
    while (ind < settings.length && curSet[settings[ind]] <= 0)
      ind++;
    if (ind < settings.length) {
      curSet[settings[ind]]--;
      if (curSet[settings[ind]] == 0) {
        nextPhase = settings[ind + 1];
        if (nextPhase == 'sets') {
          curSet.sets--;
          if (curSet.sets > 0) {
            // Start new set
            for (let i = 1; i < settings.length - 1; i++) {
              curSet[settings[i]] = params[settings[i]];
            }
            nextPhase = settings[1];
          } else {
            startTime = null;
            reset();
            return;
          }
        }
        if (curSet.sets == 1 && nextPhase == 'break') {
          reset();
        }
      }
    }
  }
  for (let param of settings) {
    $(param + '-label').textContent = curSet[param];
  }
  scheduleUpdate();
}

function handleVisibilityChange() {
  // Visibility changes affect when we need to next fire a timer event.
  if (!timer)
    return;
  clearTimeout(timer);
  if (document[hidden]) {
    scheduleUpdate();
  } else {
    // Immediately update the state if the document became visible.
    tick();
  }
}
document.addEventListener(visibilityChange, handleVisibilityChange, false);

function scheduleUpdate(nowTime) {
  if (!startTime)
    return;
  nowTime = nowTime || now();
  if (document[hidden] && events.length > 0) {
    timer = setTimeout(tick, events[0].time - nowTime);
  } else {
    timer = setTimeout(tick, 1000 - ((nowTime - startTime) % 1000));
  }
}

function pause() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  startTime = null;
  document.body.className = 'paused';
}

document.addEventListener('DOMContentLoaded', function() {
  reset();
  for (let param of settings) {
    $(param).onchange = function() {
      if (!startTime)
        reset();
    };
  }
  $('play').addEventListener('click', play);
  $('pause').addEventListener('click', pause);
  $('restart').addEventListener('click', reset);
});
