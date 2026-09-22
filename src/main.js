const defaultAlarms = [];

let stored = null;
let alarms = defaultAlarms;
try {
  stored = localStorage.getItem('daylight-alarms');
  const parsed = stored ? JSON.parse(stored) : defaultAlarms;
  alarms = Array.isArray(parsed) ? parsed : defaultAlarms;
} catch (error) {
  stored = null;
  alarms = defaultAlarms;
}
alarms = alarms.map((alarm) => ({ ...alarm, enabled: alarm.enabled === undefined || alarm.enabled === true || alarm.enabled === 'true' }));
let ringingAlarm = null;
let lastTriggered = '';
try { lastTriggered = localStorage.getItem('daylight-last-triggered') || ''; } catch (error) { /* Storage is optional. */ }
const sampleAlarmIds = new Set([1, 2, 3]);
const hadSampleAlarms = alarms.some((alarm) => sampleAlarmIds.has(alarm.id));
alarms = alarms.filter((alarm) => !sampleAlarmIds.has(alarm.id));
if (hadSampleAlarms && alarms.length && !alarms.some((alarm) => alarm.enabled)) {
  alarms[alarms.length - 1].enabled = true;
}
if (alarms.length && !alarms.some((alarm) => alarm.enabled)) {
  alarms[alarms.length - 1].enabled = true;
}
if (hadSampleAlarms || stored) {
  try { localStorage.setItem('daylight-alarms', JSON.stringify(alarms)); } catch (error) { /* Storage is optional. */ }
}
const $ = (selector) => document.querySelector(selector);
const dialog = $('#alarmDialog');
const ringtoneDialog = $('#ringtoneDialog');
const wallpaperDialog = $('#wallpaperDialog');
let editingId = null;
let pickerStage = 'time';
let stopwatchStartedAt = 0;
let stopwatchElapsed = 0;
let stopwatchTimer = null;
let timerRemaining = 300;
let timerTimer = null;
let timerUnit = 'minutes';
let ringtoneLoop = null;
let audioContext = null;
let selectedRingtoneData = '';
let selectedPictureData = '';
let savedPictures = [];
let selectedTimerRingtoneData = '';
let savedRingtones = [];
let ringtonePickerTarget = '';
let wallpaperData = '';
const ringtoneNames = { classic: 'Classic', pulse: 'Pulse', soft: 'Soft bells', chime: 'Bright chime', digital: 'Digital', rising: 'Rising tone', alert: 'Alert', marimba: 'Marimba', double: 'Double beep', gentle: 'Gentle bell' };
try {
  const storedRingtones = JSON.parse(localStorage.getItem('daylight-ringtones') || '[]');
  savedRingtones = Array.isArray(storedRingtones) ? storedRingtones.filter((ringtone) => ringtone.name && ringtone.data).slice(0, 10) : [];
} catch (error) { savedRingtones = []; }
try { wallpaperData = localStorage.getItem('daylight-wallpaper') || ''; } catch (error) { wallpaperData = ''; }
try {
  const storedPictures = JSON.parse(localStorage.getItem('daylight-pictures') || '[]');
  savedPictures = Array.isArray(storedPictures) ? storedPictures.filter((picture) => picture.name && picture.data).slice(0, 10) : [];
} catch (error) { savedPictures = []; }
setInterval(updateLiveStatus, 1000);

function save() {
  try {
    localStorage.setItem('daylight-alarms', JSON.stringify(alarms));
    return true;
  } catch (error) {
    showSavedToast('Storage unavailable');
    return false;
  }
}
function showSavedToast(message = 'Alarm saved') {
  const toast = $('#saveToast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 1800);
}
function applyWallpaper() {
  document.body.style.setProperty('--wallpaper-image', wallpaperData ? `url("${wallpaperData}")` : 'none');
  document.body.classList.toggle('has-wallpaper', Boolean(wallpaperData));
  const preview = $('#wallpaperPreview');
  preview.style.backgroundImage = wallpaperData ? `url("${wallpaperData}")` : 'none';
  preview.classList.toggle('has-image', Boolean(wallpaperData));
  preview.querySelector('span').hidden = Boolean(wallpaperData);
}
function saveWallpaper() {
  try { localStorage.setItem('daylight-wallpaper', wallpaperData); } catch (error) { showSavedToast('Wallpaper is too large to save'); }
}
function resetRingColors() {
  const overlay = $('#ringOverlay');
  overlay.style.removeProperty('--ring-accent');
  overlay.style.removeProperty('--ring-accent-text');
  overlay.style.removeProperty('--ring-surface');
}
function matchRingColors(dataUrl) {
  resetRingColors();
  if (!dataUrl) return;
  const image = new Image();
  image.addEventListener('load', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let red = 0; let green = 0; let blue = 0; let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 100) continue;
      red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
    }
    if (!count) return;
    red = Math.round(red / count); green = Math.round(green / count); blue = Math.round(blue / count);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    const accent = `rgb(${Math.min(255, red + 70)}, ${Math.min(255, green + 70)}, ${Math.min(255, blue + 70)})`;
    const text = luminance > 155 ? '#101010' : '#ffffff';
    const surface = `rgba(${Math.max(0, red - 35)}, ${Math.max(0, green - 35)}, ${Math.max(0, blue - 35)}, .78)`;
    const overlay = $('#ringOverlay');
    overlay.style.setProperty('--ring-accent', accent);
    overlay.style.setProperty('--ring-accent-text', text);
    overlay.style.setProperty('--ring-surface', surface);
  });
  image.src = dataUrl;
}
function savePictureHistory() {
  try {
    savedPictures = savedPictures.slice(0, 10);
    localStorage.setItem('daylight-pictures', JSON.stringify(savedPictures));
  } catch (error) { showSavedToast('Picture history unavailable'); }
}
function renderPictureHistory() {
  const input = $('#savedPictureInput');
  input.innerHTML = '<option value="">Choose a saved picture</option>';
  savedPictures.forEach((picture, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = picture.name;
    option.selected = picture.data === selectedPictureData;
    input.appendChild(option);
  });
  $('#savedPictureField').hidden = savedPictures.length === 0;
}
function saveRingtoneHistory() {
  try {
    savedRingtones = savedRingtones.slice(0, 10);
    localStorage.setItem('daylight-ringtones', JSON.stringify(savedRingtones));
  } catch (error) {
    showSavedToast('Ringtone history unavailable');
  }
}
function renderRingtoneHistory(selectedData = selectedRingtoneData) {
  const input = $('#savedRingtoneInput');
  input.innerHTML = '<option value="">Choose a saved ringtone</option>';
  savedRingtones.forEach((ringtone, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = ringtone.name;
    option.selected = ringtone.data === selectedData;
    input.appendChild(option);
  });
  $('#savedRingtoneField').hidden = savedRingtones.length === 0;
}
function renderTimerRingtoneHistory() {
  const input = $('#timerSavedRingtoneInput');
  input.innerHTML = '<option value="">Choose a saved ringtone</option>';
  savedRingtones.forEach((ringtone, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = ringtone.name;
    option.selected = ringtone.data === selectedTimerRingtoneData;
    input.appendChild(option);
  });
  $('#timerSavedRingtoneField').hidden = savedRingtones.length === 0;
}
function getRingtoneSelection(target) {
  return target === 'timer' ? (selectedTimerRingtoneData ? 'Custom ringtone' : ringtoneNames[$('#timerRingtone').value]) : (selectedRingtoneData ? 'Custom ringtone' : ringtoneNames[$('#soundInput').value]);
}
function renderRingtonePicker() {
  const selectedValue = ringtonePickerTarget === 'timer' ? $('#timerRingtone').value : $('#soundInput').value;
  $('#systemRingtoneList').innerHTML = Object.entries(ringtoneNames).map(([value, name]) => `<button type="button" class="ringtone-option${!((ringtonePickerTarget === 'timer' ? selectedTimerRingtoneData : selectedRingtoneData)) && value === selectedValue ? ' selected' : ''}" data-tone="${value}"><span>${name}</span><i>○</i></button>`).join('');
  $('#savedPickerRingtones').innerHTML = savedRingtones.map((ringtone, index) => `<button type="button" class="ringtone-option${(ringtonePickerTarget === 'timer' ? selectedTimerRingtoneData : selectedRingtoneData) === ringtone.data ? ' selected' : ''}" data-saved-tone="${index}"><span>${ringtone.name}</span><i>○</i></button>`).join('');
  document.querySelectorAll('#systemRingtoneList [data-tone]').forEach((button) => button.addEventListener('click', () => selectRingtone(button.dataset.tone)));
  document.querySelectorAll('#savedPickerRingtones [data-saved-tone]').forEach((button) => button.addEventListener('click', () => selectSavedRingtone(Number(button.dataset.savedTone))));
}
function updateRingtoneLabels() {
  $('#alarmRingtoneLabel').textContent = getRingtoneSelection('alarm');
  $('#timerRingtoneLabel').textContent = getRingtoneSelection('timer');
}
function selectRingtone(value) {
  if (ringtonePickerTarget === 'timer') { $('#timerRingtone').value = value; selectedTimerRingtoneData = ''; } else { $('#soundInput').value = value; selectedRingtoneData = ''; }
  updateRingtoneLabels(); ringtoneDialog.close();
}
function selectSavedRingtone(index) {
  const ringtone = savedRingtones[index];
  if (!ringtone) return;
  if (ringtonePickerTarget === 'timer') selectedTimerRingtoneData = ringtone.data; else selectedRingtoneData = ringtone.data;
  updateRingtoneLabels(); ringtoneDialog.close();
}
function playTone(type = 'classic') {
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const tones = {
    classic: { frequency: 740, wave: 'triangle' },
    pulse: { frequency: 520, wave: 'square' },
    soft: { frequency: 392, wave: 'sine' },
    chime: { frequency: 880, wave: 'sine' },
    digital: { frequency: 660, wave: 'square' },
    rising: { frequency: 980, wave: 'sawtooth' },
    alert: { frequency: 1040, wave: 'triangle' },
    marimba: { frequency: 262, wave: 'sine' },
    double: { frequency: 600, wave: 'square' },
    gentle: { frequency: 330, wave: 'sine' }
  };
  const tone = tones[type] || tones.classic;
  oscillator.type = tone.wave;
  oscillator.frequency.value = tone.frequency;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + 0.5);
}
function stopRingtone() { clearInterval(ringtoneLoop); ringtoneLoop = null; }
function playSavedRingtone(dataUrl) {
  if (!dataUrl) return false;
  const audio = new Audio(dataUrl);
  audio.play().catch(() => {});
  return true;
}
function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return { main: `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, period };
}
function getPickerTime() {
  let hour = Math.min(12, Math.max(1, Number($('#hourInput').value) || 12));
  const minute = Math.min(59, Math.max(0, Number($('#minuteInput').value) || 0));
  const period = document.querySelector('.period-button.active')?.dataset.period || 'AM';
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function updateClockFace(hour) {
  const selectedHour = Number(hour) === 0 ? 12 : Number(hour);
  document.querySelectorAll('.hour-number').forEach((button) => button.classList.toggle('selected', Number(button.dataset.hour) === selectedHour));
  document.querySelectorAll('.minute-number').forEach((button) => button.classList.toggle('selected', Number(button.dataset.minute) === Number($('#minuteInput').value)));
  const hand = $('#clockFace .clock-hand');
  const minute = Number($('#minuteInput').value) || 0;
  const selectedValue = $('#clockFace').classList.contains('minute-mode')
    ? document.querySelector(`.minute-number[data-minute="${minute}"]`)
    : document.querySelector(`.hour-number[data-hour="${selectedHour}"]`);
  if (hand && selectedValue) {
    const face = $('#clockFace').getBoundingClientRect();
    const centerX = face.left + face.width / 2;
    const centerY = face.top + face.height / 2;
    const target = selectedValue.getBoundingClientRect();
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    const angle = Math.atan2(targetX - centerX, centerY - targetY) * 180 / Math.PI;
    const radius = Math.hypot(targetX - centerX, targetY - centerY);
    hand.style.left = `${face.width / 2 - 1}px`;
    hand.style.top = `${face.height / 2 - radius}px`;
    hand.style.height = `${radius}px`;
    hand.style.transform = `rotate(${angle}deg)`;
  }
}
function buildHourPicker() {
  const face = $('#clockFace');
  for (let hour = 1; hour <= 12; hour += 1) {
    const button = document.createElement('button');
    const angle = hour * 30;
    const radians = angle * Math.PI / 180;
    button.type = 'button';
    button.className = 'clock-number hour-number';
    button.dataset.hour = hour;
    button.textContent = hour;
    button.style.left = `${84 + Math.sin(radians) * 64}px`;
    button.style.top = `${84 - Math.cos(radians) * 64}px`;
    button.addEventListener('click', () => { $('#hourInput').value = hour; updateClockFace(hour); });
    face.appendChild(button);
  }
  for (let minute = 0; minute < 60; minute += 5) {
    const button = document.createElement('button');
    const angle = (minute / 5) * 30;
    const radians = angle * Math.PI / 180;
    button.type = 'button';
    button.className = 'clock-number minute-number';
    button.dataset.minute = minute;
    button.textContent = String(minute).padStart(2, '0');
    button.style.left = `${84 + Math.sin(radians) * 64}px`;
    button.style.top = `${84 - Math.cos(radians) * 64}px`;
    button.addEventListener('click', () => { $('#minuteInput').value = String(minute).padStart(2, '0'); updateClockFace($('#hourInput').value); });
    face.appendChild(button);
  }
}
function getNextAlarm() {
  const active = alarms.filter((alarm) => alarm.enabled === true);
  if (!active.length) return null;
  const now = new Date();
  return active.map((alarm) => {
    const target = new Date(now);
    target.setHours(Number(alarm.time.slice(0, 2)), Number(alarm.time.slice(3)), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return { alarm, target };
  }).sort((a, b) => a.target - b.target)[0];
}
function updateLiveStatus() {
  const now = new Date();
  $('#currentTime').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const next = getNextAlarm();
  if (!next) {
    $('#ringSummary').textContent = 'No active alarms';
    $('#nextAlarmLabel').textContent = 'Tap + to create one';
    return;
  }
  const totalSeconds = Math.max(1, Math.ceil((next.target - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (days === 0 && hours === 0 && minutes === 0) parts.push(`${seconds} sec`);
  $('#ringSummary').textContent = `Ring in ${parts.join(' ')}`;
  $('#nextAlarmLabel').textContent = next.alarm.label;
  document.title = `Alarm • ${formatTime(next.alarm.time).main} ${formatTime(next.alarm.time).period}`;
  checkDueAlarm(now);
}
const worldCities = [
  { id: 'chennai', name: 'Chennai', country: 'India', zone: 'Asia/Kolkata', code: 'IST' },
  { id: 'london', name: 'London', country: 'United Kingdom', zone: 'Europe/London', code: 'GMT' },
  { id: 'new-york', name: 'New York', country: 'United States', zone: 'America/New_York', code: 'EST' },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', zone: 'Asia/Tokyo', code: 'JST' },
  { id: 'paris', name: 'Paris', country: 'France', zone: 'Europe/Paris', code: 'CET' },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', zone: 'Asia/Dubai', code: 'GST' },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', zone: 'Asia/Singapore', code: 'SGT' },
  { id: 'sydney', name: 'Sydney', country: 'Australia', zone: 'Australia/Sydney', code: 'AEDT' },
  { id: 'sao-paulo', name: 'Sao Paulo', country: 'Brazil', zone: 'America/Sao_Paulo', code: 'BRT' },
  { id: 'los-angeles', name: 'Los Angeles', country: 'United States', zone: 'America/Los_Angeles', code: 'PST' }
];
const defaultWorldCityIds = ['chennai', 'london', 'new-york', 'tokyo'];
let worldCityIds = defaultWorldCityIds;
try {
  const storedWorldCities = JSON.parse(localStorage.getItem('daylight-world-cities') || 'null');
  if (Array.isArray(storedWorldCities)) worldCityIds = [...new Set([...defaultWorldCityIds, ...storedWorldCities])].filter((id) => worldCities.some((city) => city.id === id));
} catch (error) { worldCityIds = defaultWorldCityIds; }
function saveWorldCities() {
  try { localStorage.setItem('daylight-world-cities', JSON.stringify(worldCityIds.filter((id) => !defaultWorldCityIds.includes(id)))); } catch (error) { showSavedToast('World clocks could not be saved'); }
}
function renderWorldCities() {
  const cityList = $('#cityList');
  const cityOptions = $('#cityOptions');
  cityOptions.innerHTML = worldCities.map((city) => `<option value="${city.name}, ${city.country}"></option>`).join('');
  cityList.innerHTML = worldCityIds.map((id) => {
    const city = worldCities.find((item) => item.id === id);
    const removable = !defaultWorldCityIds.includes(city.id);
    return `<article class="city-card"><div><strong>${city.name}</strong><span>${city.country} · ${city.code}</span></div><time data-zone="${city.zone}">--:--</time>${removable ? `<button class="city-remove" type="button" data-remove-city="${city.id}" aria-label="Remove ${city.name}">x</button>` : ''}</article>`;
  }).join('');
  cityList.querySelectorAll('[data-remove-city]').forEach((button) => button.addEventListener('click', () => {
    worldCityIds = worldCityIds.filter((id) => id !== button.dataset.removeCity);
    saveWorldCities();
    renderWorldCities();
    updateWorldClocks();
  }));
}
function updateWorldClocks() {
  document.querySelectorAll('[data-zone]').forEach((clock) => {
    clock.textContent = new Intl.DateTimeFormat('en-US', { timeZone: clock.dataset.zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  });
}
function formatStopwatch(milliseconds) {
  const total = Math.floor(milliseconds / 10);
  return `${String(Math.floor(total / 6000)).padStart(2, '0')}:${String(Math.floor((total % 6000) / 100)).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
}
function updateStopwatch() {
  if (stopwatchStartedAt) stopwatchElapsed = Date.now() - stopwatchStartedAt;
  $('#stopwatchDisplay').textContent = formatStopwatch(stopwatchElapsed);
}
function updateTimer() {
  const hours = Math.floor(timerRemaining / 3600);
  const minutes = Math.floor((timerRemaining % 3600) / 60);
  const seconds = timerRemaining % 60;
  $('#timerDisplay').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function buildTimerPicker() {
  const face = $('#timerClockFace');
  face.querySelectorAll('.timer-number').forEach((button) => button.remove());
  const values = timerUnit === 'hours' ? Array.from({ length: 12 }, (_, index) => index + 1) : Array.from({ length: 12 }, (_, index) => index * 5);
  values.forEach((value, index) => {
    const button = document.createElement('button');
    const angle = timerUnit === 'hours' ? (value % 12) * 30 : index * 30;
    const radians = angle * Math.PI / 180;
    button.type = 'button'; button.className = 'clock-number timer-number'; button.dataset.value = value; button.textContent = String(value).padStart(2, '0');
    button.style.left = `${84 + Math.sin(radians) * 64}px`; button.style.top = `${84 - Math.cos(radians) * 64}px`;
    button.addEventListener('click', () => selectTimerValue(value)); face.appendChild(button);
  });
  const inputId = `timer${timerUnit[0].toUpperCase()}${timerUnit.slice(1)}`;
  const currentValue = Number($(`#${inputId}`).value) || 0;
  const visualValue = timerUnit === 'hours' ? (currentValue || 12) : Math.round(currentValue / 5) * 5;
  selectTimerValue(visualValue, false);
}
function selectTimerValue(value, writeInput = true) {
  const input = $(`#timer${timerUnit[0].toUpperCase()}${timerUnit.slice(1)}`);
  if (writeInput) input.value = String(value).padStart(2, '0');
  document.querySelectorAll('.timer-number').forEach((button) => button.classList.toggle('selected', Number(button.dataset.value) === value));
  const selectedButton = [...document.querySelectorAll('.timer-number')].find((button) => Number(button.dataset.value) === value);
  document.querySelectorAll('.timer-number').forEach((button) => button.classList.toggle('selected', button === selectedButton));
  const hand = $('#timerClockFace .clock-hand');
  const face = $('#timerClockFace').getBoundingClientRect();
  const target = selectedButton?.getBoundingClientRect();
  if (hand && target) {
    const centerX = face.left + face.width / 2;
    const centerY = face.top + face.height / 2;
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    const radius = Math.hypot(targetX - centerX, targetY - centerY);
    hand.style.left = `${face.width / 2 - 1}px`;
    hand.style.top = `${face.height / 2 - radius}px`;
    hand.style.height = `${radius}px`;
    hand.style.transform = `rotate(${Math.atan2(targetX - centerX, centerY - targetY) * 180 / Math.PI}deg)`;
  }
  syncTimerInput();
}
function checkDueAlarm(now) {
  const due = alarms.find((alarm) => alarm.enabled === true && alarm.time === now.toTimeString().slice(0, 5));
  const triggerKey = due ? `${due.id}-${now.toISOString().slice(0, 10)}-${due.time}` : '';
  if (due && now.getSeconds() < 2 && triggerKey !== lastTriggered) {
    lastTriggered = triggerKey;
    try { localStorage.setItem('daylight-last-triggered', lastTriggered); } catch (error) { /* Storage is optional. */ }
    ringingAlarm = due;
    $('#ringTitle').textContent = due.label;
    const display = formatTime(due.time);
    $('#ringTime').textContent = `${display.main} ${display.period}`;
    $('#ringBackground').src = due.pictureData || '';
    $('#ringBackground').hidden = !due.pictureData;
    matchRingColors(due.pictureData);
    $('#ringOverlay').hidden = false;
    try {
      const play = () => (due.ringtoneData ? playSavedRingtone(due.ringtoneData) : playTone(due.sound || 'classic'));
      play(); ringtoneLoop = setInterval(play, 1400);
    } catch (error) { /* Audio may be blocked until user interaction. */ }
  }
}
function render() {
  const active = alarms.filter((alarm) => alarm.enabled === true);
  $('#alarmCount').textContent = `${active.length} active`;
  $('#emptyState').hidden = alarms.length > 0;
  $('#alarmList').innerHTML = alarms.map((alarm) => {
    const isEnabled = alarm.enabled === true;
    const time = formatTime(alarm.time);
    return `<article class="alarm-card ${isEnabled ? 'is-active' : 'is-off'}" data-id="${alarm.id}" tabindex="0" aria-label="Edit ${alarm.label}">
      ${alarm.pictureData ? `<img class="alarm-picture" src="${alarm.pictureData}" alt="" />` : ''}
      <div class="alarm-time"><strong>${time.main}</strong><span>${time.period}</span></div>
      <div class="alarm-details"><strong>${alarm.label}</strong><span>${alarm.repeat}</span><b class="alarm-state-text">${isEnabled ? 'Active' : 'Off'}</b></div>
      <span class="alarm-status">${isEnabled ? 'Active' : 'Off'}</span>
      <button class="toggle ${isEnabled ? 'on' : ''}" data-action="toggle" aria-pressed="${isEnabled}" aria-label="${isEnabled ? 'Disable' : 'Enable'} ${alarm.label}"><span></span></button>
      <button class="edit-button" data-action="edit" aria-label="Edit ${alarm.label}">&#9998;</button>
      <button class="delete-button" data-action="delete" aria-label="Delete ${alarm.label}">&#215;</button>
    </article>`;
  }).join('');
  const next = active.sort((a, b) => a.time.localeCompare(b.time))[0];
  if (next) {
    const nextTime = formatTime(next.time);
    const now = new Date();
    const target = new Date();
    target.setHours(Number(next.time.slice(0, 2)), Number(next.time.slice(3)), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const minutes = Math.max(1, Math.round((target - now) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    $('#ringSummary').textContent = `Ring in ${days ? `${days} day ` : ''}${hours ? `${hours} hour ` : ''}${mins} minutes`;
    $('#nextAlarmLabel').textContent = next.label;
  } else {
    $('#ringSummary').textContent = 'No active alarms';
    $('#nextAlarmLabel').textContent = 'Tap + to create one';
  }
}

$('#alarmList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('.alarm-card');
  if (!card) return;
  const id = Number(card.dataset.id);
  if (!button) { openDialog(id); return; }
  if (button.dataset.action === 'delete') alarms = alarms.filter((alarm) => alarm.id !== id);
  if (button.dataset.action === 'toggle') alarms = alarms.map((alarm) => alarm.id === id ? { ...alarm, enabled: !alarm.enabled } : alarm);
  if (button.dataset.action === 'edit') { openDialog(id); return; }
  save(); render();
});

$('#alarmList').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') event.target.closest('.alarm-card')?.click();
});

function openDialog(id = null) {
  editingId = id;
  pickerStage = 'time';
  const alarm = alarms.find((item) => item.id === id);
  $('#dialogEyebrow').textContent = alarm ? 'Edit alarm' : 'New alarm';
  $('#dialogTitle').textContent = alarm ? 'Edit alarm' : 'Set alarm time';
  $('#saveAlarmButton').innerHTML = alarm ? 'Update <span>&#8594;</span>' : 'OK <span>&#8594;</span>';
  const sourceTime = alarm?.time || '07:00';
  const [sourceHour, sourceMinute] = sourceTime.split(':').map(Number);
  $('#hourInput').value = sourceHour % 12 || 12;
  $('#minuteInput').value = String(sourceMinute).padStart(2, '0');
  updateClockFace(sourceHour % 12 || 12);
  document.querySelectorAll('.period-button').forEach((button) => button.classList.toggle('active', button.dataset.period === (sourceHour >= 12 ? 'PM' : 'AM')));
  $('#labelInput').value = alarm?.label || 'Morning reset';
  $('#repeatInput').value = alarm?.repeat || 'Every day';
  $('#soundInput').value = alarm?.sound || 'classic';
  selectedRingtoneData = alarm?.ringtoneData || '';
  selectedPictureData = alarm?.pictureData || '';
  $('#vibrateInput').checked = alarm?.vibrate !== false;
  $('#ringtoneFile').value = '';
  $('#pictureFile').value = '';
  renderRingtoneHistory();
  renderPictureHistory();
  $('#pickerDetails').hidden = true;
  document.querySelector('.picker-actions').hidden = false;
  dialog.showModal();
  setTimeout(() => $('#hourInput').focus(), 50);
}
$('#addAlarmButton').addEventListener('click', () => openDialog());
$('#emptyAddButton').addEventListener('click', () => openDialog());
$('#closeDialog').addEventListener('click', () => dialog.close());
function saveAlarm() {
  const details = { time: getPickerTime(), label: $('#labelInput').value.trim(), repeat: $('#repeatInput').value, sound: $('#soundInput').value, ringtoneData: selectedRingtoneData, pictureData: selectedPictureData, vibrate: $('#vibrateInput').checked };
  if (editingId) alarms = alarms.map((alarm) => alarm.id === editingId ? { ...alarm, ...details, enabled: true } : alarm);
  else alarms.push({ id: Date.now(), ...details, enabled: true });
  editingId = null;
  if (!save()) return;
  render(); dialog.close(); showSavedToast('Alarm saved • Active');
}
$('#alarmForm').addEventListener('submit', (event) => { event.preventDefault(); saveAlarm(); });
$('#saveAlarmButton').addEventListener('click', saveAlarm);
$('#pictureFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    selectedPictureData = reader.result;
    savedPictures = [{ name: file.name, data: reader.result }, ...savedPictures.filter((picture) => picture.name !== file.name)].slice(0, 10);
    savePictureHistory();
    renderPictureHistory();
    showSavedToast(`${file.name} added`);
  });
  reader.readAsDataURL(file);
});
$('#savedPictureInput').addEventListener('change', (event) => {
  const picture = savedPictures[Number(event.target.value)];
  if (!picture) return;
  selectedPictureData = picture.data;
  showSavedToast(`${picture.name} selected`);
});
$('#confirmPicker').addEventListener('click', () => {
  saveAlarm();
});
$('#cancelPicker').addEventListener('click', () => dialog.close());
$('#clearButton').addEventListener('click', () => { alarms = alarms.filter((alarm) => alarm.enabled === true); save(); render(); });
function closeRinging() { stopRingtone(); ringingAlarm = null; $('#ringOverlay').hidden = true; $('#ringBackground').src = ''; $('#ringBackground').hidden = true; resetRingColors(); }
$('#dismissButton').addEventListener('click', closeRinging);
$('#snoozeButton').addEventListener('click', () => {
  if (!ringingAlarm) return;
  const snoozeTarget = new Date();
  snoozeTarget.setMinutes(snoozeTarget.getMinutes() + 5);
  const time = `${String(snoozeTarget.getHours()).padStart(2, '0')}:${String(snoozeTarget.getMinutes()).padStart(2, '0')}`;
  alarms = alarms.map((alarm) => alarm.id === ringingAlarm.id ? { ...alarm, time } : alarm);
  save(); closeRinging(); render(); showSavedToast('Snoozed for 5 min');
});
$('#previewSound').addEventListener('click', () => selectedRingtoneData ? playSavedRingtone(selectedRingtoneData) : playTone($('#soundInput').value));
$('#previewTimerSound').addEventListener('click', () => selectedTimerRingtoneData ? playSavedRingtone(selectedTimerRingtoneData) : playTone($('#timerRingtone').value));
document.querySelectorAll('[data-ringtone-picker]').forEach((button) => button.addEventListener('click', () => { ringtonePickerTarget = button.dataset.ringtonePicker; renderRingtonePicker(); ringtoneDialog.showModal(); }));
$('#closeRingtoneDialog').addEventListener('click', () => ringtoneDialog.close());
$('.overflow-button').addEventListener('click', () => { applyWallpaper(); wallpaperDialog.showModal(); });
$('#closeWallpaperDialog').addEventListener('click', () => wallpaperDialog.close());
$('#wallpaperFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => { wallpaperData = reader.result; applyWallpaper(); showSavedToast('Wallpaper ready'); });
  reader.readAsDataURL(file);
});
$('#applyWallpaperButton').addEventListener('click', () => { saveWallpaper(); applyWallpaper(); wallpaperDialog.close(); showSavedToast('Wallpaper applied'); });
$('#removeWallpaperButton').addEventListener('click', () => { wallpaperData = ''; saveWallpaper(); applyWallpaper(); showSavedToast('Wallpaper removed'); });
$('#downloadWallpaperButton').addEventListener('click', () => {
  if (!wallpaperData) { showSavedToast('Choose a wallpaper first'); return; }
  const link = document.createElement('a');
  link.href = wallpaperData;
  link.download = 'alarm-wallpaper.png';
  link.click();
  showSavedToast('Wallpaper downloaded');
});
$('#pickerRingtoneFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const ringtone = { name: file.name, data: reader.result };
    savedRingtones = [ringtone, ...savedRingtones.filter((item) => item.name !== file.name)].slice(0, 10);
    if (ringtonePickerTarget === 'timer') selectedTimerRingtoneData = ringtone.data; else selectedRingtoneData = ringtone.data;
    saveRingtoneHistory();
    renderRingtoneHistory();
    renderTimerRingtoneHistory();
    renderRingtonePicker();
    updateRingtoneLabels();
    ringtoneDialog.close();
    showSavedToast(`${file.name} selected`);
  });
  reader.readAsDataURL(file);
});
$('#savedRingtoneInput').addEventListener('change', (event) => {
  const ringtone = savedRingtones[Number(event.target.value)];
  if (!ringtone) return;
  selectedRingtoneData = ringtone.data;
  showSavedToast(`${ringtone.name} selected`);
});
$('#ringtoneFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    selectedRingtoneData = reader.result;
    savedRingtones = [{ name: file.name, data: reader.result }, ...savedRingtones.filter((ringtone) => ringtone.name !== file.name)].slice(0, 10);
    saveRingtoneHistory();
    renderRingtoneHistory();
    renderRingtonePicker();
    updateRingtoneLabels();
    showSavedToast(`${file.name} saved`);
  });
  reader.readAsDataURL(file);
});
$('#timerSavedRingtoneInput').addEventListener('change', (event) => {
  const ringtone = savedRingtones[Number(event.target.value)];
  if (!ringtone) {
    selectedTimerRingtoneData = '';
    return;
  }
  selectedTimerRingtoneData = ringtone.data;
  showSavedToast(`${ringtone.name} selected for timer`);
});
$('#timerRingtoneFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    selectedTimerRingtoneData = reader.result;
    savedRingtones = [{ name: file.name, data: reader.result }, ...savedRingtones.filter((ringtone) => ringtone.name !== file.name)].slice(0, 10);
    saveRingtoneHistory();
    renderRingtoneHistory();
    renderTimerRingtoneHistory();
    renderRingtonePicker();
    updateRingtoneLabels();
    showSavedToast(`${file.name} saved for timer`);
  });
  reader.readAsDataURL(file);
});
document.querySelectorAll('[data-ringtone-preview]').forEach((button) => button.addEventListener('click', () => playTone($(`#${button.dataset.ringtonePreview}`).value)));
const viewMap = {
  alarm: ['.next-panel', '.alarm-section'],
  worldClock: ['#worldClockView'],
  stopwatch: ['#stopwatchView'],
  timer: ['#timerView']
};
const viewTitles = { alarm: 'Alarm', worldClock: 'World Clock', stopwatch: 'Stopwatch', timer: 'Timer' };
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
  const selectedView = item.dataset.view;
  document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.toggle('active', navItem === item));
  document.querySelectorAll('.next-panel,.alarm-section,.tool-view').forEach((view) => { view.hidden = true; });
  viewMap[selectedView].forEach((selector) => { $(selector).hidden = false; });
  $('#addAlarmButton').hidden = selectedView !== 'alarm';
  document.querySelector('.topbar h1').textContent = viewTitles[selectedView];
  if (selectedView === 'worldClock') updateWorldClocks();
}));
$('#addCityButton').addEventListener('click', () => {
  const query = $('#citySearch').value.trim().toLowerCase();
  const city = worldCities.find((item) => `${item.name}, ${item.country}`.toLowerCase() === query || item.name.toLowerCase() === query || item.country.toLowerCase() === query);
  if (!city) { showSavedToast('Choose a city from the search list'); return; }
  if (worldCityIds.includes(city.id)) { showSavedToast(`${city.name} is already added`); return; }
  worldCityIds = [...worldCityIds, city.id];
  saveWorldCities();
  $('#citySearch').value = '';
  renderWorldCities();
  updateWorldClocks();
  showSavedToast(`${city.name} added`);
});
$('#stopwatchStart').addEventListener('click', (event) => {
  if (stopwatchStartedAt) {
    stopwatchElapsed = Date.now() - stopwatchStartedAt;
    stopwatchStartedAt = 0;
    clearInterval(stopwatchTimer);
    event.currentTarget.textContent = 'Start';
  } else {
    stopwatchStartedAt = Date.now() - stopwatchElapsed;
    stopwatchTimer = setInterval(updateStopwatch, 10);
    event.currentTarget.textContent = 'Pause';
  }
});
$('#stopwatchReset').addEventListener('click', () => { stopwatchStartedAt = 0; stopwatchElapsed = 0; clearInterval(stopwatchTimer); updateStopwatch(); $('#stopwatchStart').textContent = 'Start'; });
function syncTimerInput() { timerRemaining = Math.max(0, Number($('#timerHours').value || 0) * 3600 + Number($('#timerMinutes').value || 0) * 60 + Number($('#timerSeconds').value || 0)); updateTimer(); }
['timerHours', 'timerMinutes', 'timerSeconds'].forEach((id) => $(`#${id}`).addEventListener('input', syncTimerInput));
document.querySelectorAll('.timer-unit').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.timer-unit').forEach((item) => item.classList.remove('active')); button.classList.add('active'); timerUnit = button.dataset.unit; buildTimerPicker(); }));
$('#timerStart').addEventListener('click', (event) => {
  if (timerTimer) { clearInterval(timerTimer); timerTimer = null; event.currentTarget.textContent = 'Start'; return; }
  timerTimer = setInterval(() => { timerRemaining -= 1; updateTimer(); if (timerRemaining <= 0) { clearInterval(timerTimer); timerTimer = null; event.currentTarget.textContent = 'Start'; selectedTimerRingtoneData ? playSavedRingtone(selectedTimerRingtoneData) : playTone($('#timerRingtone').value); showSavedToast('Timer complete'); } }, 1000);
  event.currentTarget.textContent = 'Pause';
});
$('#timerReset').addEventListener('click', () => { clearInterval(timerTimer); timerTimer = null; timerRemaining = Math.max(0, Number($('#timerHours').value || 0) * 3600 + Number($('#timerMinutes').value || 0) * 60 + Number($('#timerSeconds').value || 0)); updateTimer(); $('#timerStart').textContent = 'Start'; });
render();
renderTimerRingtoneHistory();
updateRingtoneLabels();
renderPictureHistory();
renderWorldCities();
setInterval(render, 60000);
setInterval(updateWorldClocks, 1000);
updateTimer();
applyWallpaper();
buildTimerPicker();
buildHourPicker();
$('#hourInput').addEventListener('input', (event) => updateClockFace(event.target.value));
$('#minuteInput').addEventListener('input', () => updateClockFace($('#hourInput').value));
$('#hourInput').addEventListener('focus', () => {
  $('#clockFace').classList.remove('minute-mode');
  updateClockFace($('#hourInput').value);
});
$('#minuteInput').addEventListener('focus', () => {
  $('#clockFace').classList.add('minute-mode');
  updateClockFace($('#hourInput').value);
});
document.querySelectorAll('.period-button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.period-button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
}));