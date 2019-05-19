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
  startTime = null;
  document.body.className = 'ready';
  for (let param of settings) {
    curSet[param] = params[param] = parseTime($(param).value);
  }
  tick();
}

let startTime = null;
let timer = null;

function now() {
  return (new Date()).getTime();
}

function play() {
  startTime = now();
  document.body.className = 'playing';
  scheduleUpdate();
}

function speak(text) {
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function tick() {
  let curTime = now();
  let ticks = startTime ? 1 : 0;
  let ind = 0;
  let done = false;
  while (ticks-- > 0) {
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
          speak('Done');
          reset();
        } else if (nextPhase == 'work') {
          speak('go');
        } else if (nextPhase == 'break') {
          speak('switch');
        }
      } else if (curSet[settings[ind]] <= 3) {
        speak(curSet[settings[ind]]);
      } else if (curSet[settings[ind]] == Math.floor(params[settings[ind]] / 2)) {
        // Only announce halfway if during work phase.
        if (ind == 1 && $('halfway').checked)
          speak('Halfway');
      }
    }
  }
  // TODO: Do # ticks
  for (let param of settings) {
    $(param + '-label').textContent = curSet[param];
  }
  scheduleUpdate();
}

function scheduleUpdate() {
  if (!startTime)
    return;
  timer = setTimeout(tick, 1000 - ((now() - startTime) % 1000));
}

function pause() {
  clearTimeout(timer);
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
