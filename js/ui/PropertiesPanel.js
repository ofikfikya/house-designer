// ui/PropertiesPanel.js
//
// Renders the properties of whatever is selected. In Phase 1 that is
// only ever a wall (Length / Thickness / Height), but the panel is
// written to key off `houseState.selection.type` so Phase 3+ can add a
// `_renderDoor()` / `_renderWindow()` branch alongside `_renderWall()`
// without restructuring this file.

import { houseState } from '../state.js';
import {
  MIN_WALL_THICKNESS_M,
  MAX_WALL_THICKNESS_M,
  MIN_WALL_HEIGHT_M,
  MAX_WALL_HEIGHT_M,
  MIN_WALL_LENGTH_M,
} from '../constants.js';

export class PropertiesPanel {
  constructor(rootEl) {
    this.root = rootEl;
    houseState.addEventListener('change', () => this.render());
    this.render();
  }

  render() {
    const wall = houseState.getSelectedWall();
    const room = houseState.getSelectedRoom();
    this.root.innerHTML = '';

    if (wall) {
      this.root.classList.add('panel-has-content');
      document.body.classList.add('mobile-panel-open');
      this._renderWall(wall);
    } else if (room) {
      this.root.classList.add('panel-has-content');
      document.body.classList.add('mobile-panel-open');
      this._renderRoom(room);
    } else {
      this.root.classList.remove('panel-has-content');
      document.body.classList.remove('mobile-panel-open');
      this.root.appendChild(this._emptyState());
    }
  }

  _renderWall(wall) {
    const lengthM = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <button class="panel-close" type="button" aria-label="Tutup panel">&times;</button>
      <span class="panel-eyebrow">Dinding terpilih</span>
      <h2>Properti</h2>
    `;
    header.querySelector('.panel-close').addEventListener('click', () => {
      document.body.classList.remove('mobile-panel-open');
    });
    this.root.appendChild(header);

    const form = document.createElement('div');
    form.className = 'panel-form';

    form.appendChild(
      this._numberField({
        label: 'Panjang',
        value: lengthM,
        min: MIN_WALL_LENGTH_M,
        max: 999,
        step: 0.01,
        onCommit: (value) => this._applyLength(wall.id, value),
      })
    );
    form.appendChild(
      this._numberField({
        label: 'Ketebalan',
        value: wall.thickness,
        min: MIN_WALL_THICKNESS_M,
        max: MAX_WALL_THICKNESS_M,
        step: 0.01,
        onCommit: (value) => houseState.updateWall(wall.id, { thickness: value }),
      })
    );
    form.appendChild(
      this._numberField({
        label: 'Tinggi',
        value: wall.height,
        min: MIN_WALL_HEIGHT_M,
        max: MAX_WALL_HEIGHT_M,
        step: 0.05,
        onCommit: (value) => houseState.updateWall(wall.id, { height: value }),
      })
    );

    this.root.appendChild(form);

    const footer = document.createElement('div');
    footer.className = 'panel-footer';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Hapus Dinding';
    deleteBtn.addEventListener('click', () => {
      houseState.removeWall(wall.id);
      houseState.clearSelection();
    });
    footer.appendChild(deleteBtn);
    this.root.appendChild(footer);
  }

  _renderRoom(room) {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <button class="panel-close" type="button" aria-label="Tutup panel">&times;</button>
      <span class="panel-eyebrow">Ruangan terpilih</span>
      <h2>Properti</h2>
    `;
    header.querySelector('.panel-close').addEventListener('click', () => {
      document.body.classList.remove('mobile-panel-open');
    });
    this.root.appendChild(header);

    const form = document.createElement('div');
    form.className = 'panel-form';

    form.appendChild(
      this._textField({
        label: 'Nama Ruangan',
        value: room.name,
        onCommit: (value) => houseState.renameRoom(room.id, value),
      })
    );

    const areaField = document.createElement('div');
    areaField.className = 'field';
    areaField.innerHTML = `
      <span class="field-label">Luas</span>
      <div class="field-readonly">${room.area.toFixed(2)} m\u00b2</div>
    `;
    form.appendChild(areaField);

    this.root.appendChild(form);

    const footer = document.createElement('div');
    footer.className = 'panel-footer';
    const hint = document.createElement('p');
    hint.className = 'panel-empty-hint';
    hint.textContent =
      'Ruangan terdeteksi otomatis dari dinding yang membentuk area tertutup. Untuk mengubah bentuk atau luasnya, edit dinding di sekelilingnya lewat alat Wall atau Select.';
    footer.appendChild(hint);
    this.root.appendChild(footer);
  }

  _applyLength(wallId, newLength) {
    const wall = houseState.getWallById(wallId);
    if (!wall) return;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const currentLength = Math.hypot(dx, dy) || 1;
    const ux = dx / currentLength;
    const uy = dy / currentLength;
    houseState.updateWall(wallId, {
      end: {
        x: round2(wall.start.x + ux * newLength),
        y: round2(wall.start.y + uy * newLength),
      },
    });
    houseState.normalizeJunctions();
  }

  _emptyState() {
    const div = document.createElement('div');
    div.className = 'panel-empty';
    div.innerHTML = `
      <span class="panel-eyebrow">Properti</span>
      <p class="panel-empty-title">Belum ada yang dipilih.</p>
      <p class="panel-empty-hint">Klik dinding (alat Select) untuk mengatur panjang/ketebalan/tinggi, atau klik di dalam ruangan (alat Room) untuk mengganti namanya.</p>
    `;
    return div;
  }

  _textField({ label, value, onCommit }) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';

    const labelRow = document.createElement('span');
    labelRow.className = 'field-label';
    labelRow.textContent = label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-input field-input-text';
    input.value = value;
    input.maxLength = 40;

    const commit = () => {
      const trimmed = input.value.trim();
      if (trimmed.length === 0) {
        input.value = value; // reject a blank name, revert to the previous one
        return;
      }
      input.value = trimmed;
      onCommit(trimmed);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('blur', commit);

    wrapper.appendChild(labelRow);
    wrapper.appendChild(input);
    return wrapper;
  }

  _numberField({ label, value, min, max, step, onCommit }) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';

    const labelRow = document.createElement('span');
    labelRow.className = 'field-label';
    labelRow.textContent = `${label} (m)`;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'field-input';
    input.value = value.toFixed(2);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.inputMode = 'decimal';

    const errorEl = document.createElement('span');
    errorEl.className = 'field-error';

    const commit = () => {
      let parsed = parseFloat(input.value);
      errorEl.textContent = '';
      input.classList.remove('field-input-error');

      if (Number.isNaN(parsed)) {
        input.value = value.toFixed(2);
        return;
      }
      if (parsed < min) {
        parsed = min;
        errorEl.textContent = `Minimum ${min} m`;
        input.classList.add('field-input-error');
      } else if (parsed > max) {
        parsed = max;
        errorEl.textContent = `Maksimum ${max} m`;
        input.classList.add('field-input-error');
      }
      parsed = round2(parsed);
      input.value = parsed.toFixed(2);
      onCommit(parsed);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('blur', commit);

    wrapper.appendChild(labelRow);
    wrapper.appendChild(input);
    wrapper.appendChild(errorEl);
    return wrapper;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
