/**
 * Simulation Builder - Main Entry Point
 * SillyTavern Extension for building custom simulations
 * Compatible with SillyTavern's extension loading system
 */

(function() {
    'use strict';

    const VERSION = '1.0.0';
    const DISPLAY_NAME = 'Simulation Builder';
    const MODULE_NAME = 'simulation_builder';

    // ========================================
    // Utility Functions
    // ========================================
    
    function log(...args) {
        console.log(`[${DISPLAY_NAME}]`, ...args);
    }

    function logError(...args) {
        console.error(`[${DISPLAY_NAME}]`, ...args);
    }

    function isPlainObject(val) {
        return val !== null && typeof val === 'object' && !Array.isArray(val);
    }

    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    function isNonEmptyString(val) {
        return typeof val === 'string' && val.trim().length > 0;
    }

    function toString(val, defaultVal = '') {
        if (typeof val === 'string') return val;
        if (val === null || val === undefined) return defaultVal;
        return String(val);
    }

    function toNumber(val, defaultVal = 0) {
        const num = parseFloat(val);
        return isNaN(num) ? defaultVal : num;
    }

    function generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    function sanitizeId(str) {
        return toString(str, 'stat')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 32);
    }

    function safeJsonParse(str, defaultVal = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultVal;
        }
    }

    // ========================================
    // Stat Display Modes
    // ========================================
    
    const StatDisplayMode = Object.freeze({
        VALUE: 'value',
        FRACTION: 'fraction',
        PERCENT: 'percent',
        BAR: 'bar',
        HIDDEN: 'hidden'
    });

    // ========================================
    // Stat Class
    // ========================================
    
    class Stat {
        constructor(config = {}) {
            this.id = isNonEmptyString(config.id) ? sanitizeId(config.id) : generateId('stat');
            this.name = toString(config.name, 'Unnamed Stat');
            this.baseValue = toNumber(config.baseValue, 100);
            this.currentValue = toNumber(config.currentValue, this.baseValue);
            this.minValue = toNumber(config.minValue, 0);
            this.maxValue = toNumber(config.maxValue, 100);
            this.color = toString(config.color, '#4a90d9');
            this.displayMode = config.displayMode || StatDisplayMode.FRACTION;
            this.showInUI = config.showInUI !== false;
            this.category = toString(config.category, '');
            this.lastChange = 0;
        }

        get finalValue() {
            return Math.max(this.minValue, Math.min(this.maxValue, this.currentValue));
        }

        get percentage() {
            const range = this.maxValue - this.minValue;
            if (range <= 0) return 100;
            return ((this.finalValue - this.minValue) / range) * 100;
        }

        modify(delta) {
            const oldValue = this.currentValue;
            this.currentValue = Math.max(this.minValue, Math.min(this.maxValue, this.currentValue + delta));
            this.lastChange = this.currentValue - oldValue;
            return { oldValue, newValue: this.currentValue, actualChange: this.lastChange };
        }

        set(value) {
            const oldValue = this.currentValue;
            this.currentValue = Math.max(this.minValue, Math.min(this.maxValue, value));
            this.lastChange = this.currentValue - oldValue;
            return { oldValue, newValue: this.currentValue, actualChange: this.lastChange };
        }

        reset() {
            return this.set(this.baseValue);
        }

        setBounds(min, max) {
            this.minValue = toNumber(min, 0);
            this.maxValue = toNumber(max, 100);
            if (this.minValue > this.maxValue) {
                [this.minValue, this.maxValue] = [this.maxValue, this.minValue];
            }
            this.currentValue = Math.max(this.minValue, Math.min(this.maxValue, this.currentValue));
        }

        getDisplayString() {
            switch (this.displayMode) {
                case StatDisplayMode.VALUE:
                    return `${Math.round(this.finalValue)}`;
                case StatDisplayMode.FRACTION:
                    return `${Math.round(this.finalValue)}/${Math.round(this.maxValue)}`;
                case StatDisplayMode.PERCENT:
                    return `${Math.round(this.percentage)}%`;
                case StatDisplayMode.BAR:
                    return '';
                default:
                    return `${Math.round(this.finalValue)}`;
            }
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                baseValue: this.baseValue,
                currentValue: this.currentValue,
                minValue: this.minValue,
                maxValue: this.maxValue,
                color: this.color,
                displayMode: this.displayMode,
                showInUI: this.showInUI,
                category: this.category
            };
        }

        static fromJSON(data) {
            return new Stat(data);
        }
    }

    // ========================================
    // Stat Manager
    // ========================================
    
    class StatManager {
        constructor() {
            this.stats = new Map();
        }

        add(stat) {
            const s = stat instanceof Stat ? stat : new Stat(stat);
            this.stats.set(s.id, s);
            return s;
        }

        remove(statId) {
            return this.stats.delete(sanitizeId(statId));
        }

        get(statId) {
            return this.stats.get(sanitizeId(statId));
        }

        has(statId) {
            return this.stats.has(sanitizeId(statId));
        }

        getAll() {
            return Array.from(this.stats.values());
        }

        getVisible() {
            return this.getAll().filter(s => s.showInUI && s.displayMode !== StatDisplayMode.HIDDEN);
        }

        clear() {
            this.stats.clear();
        }

        resetAll() {
            for (const stat of this.stats.values()) {
                stat.reset();
            }
        }

        toJSON() {
            return { stats: this.getAll().map(s => s.toJSON()) };
        }

        fromJSON(data) {
            this.clear();
            if (isPlainObject(data) && Array.isArray(data.stats)) {
                for (const statData of data.stats) {
                    const stat = Stat.fromJSON(statData);
                    this.stats.set(stat.id, stat);
                }
            }
            return this;
        }
    }

    // ========================================
    // Simulation State
    // ========================================
    
    class SimulationState {
        constructor(id) {
            this.id = isNonEmptyString(id) ? id : generateId('sim');
            this.name = 'New Simulation';
            this.createdAt = Date.now();
            this.updatedAt = Date.now();
            this.turnCount = 0;
            this.statManager = new StatManager();
        }

        tick() {
            this.turnCount++;
            this.updatedAt = Date.now();
            return { turn: this.turnCount };
        }

        reset() {
            this.turnCount = 0;
            this.updatedAt = Date.now();
            this.statManager.resetAll();
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                createdAt: this.createdAt,
                updatedAt: this.updatedAt,
                turnCount: this.turnCount,
                statManager: this.statManager.toJSON()
            };
        }

        static fromJSON(data) {
            if (!isPlainObject(data)) {
                return new SimulationState();
            }
            const state = new SimulationState(data.id);
            state.name = toString(data.name, 'Loaded Simulation');
            state.createdAt = data.createdAt || Date.now();
            state.updatedAt = data.updatedAt || Date.now();
            state.turnCount = data.turnCount || 0;
            if (data.statManager) {
                state.statManager.fromJSON(data.statManager);
            }
            return state;
        }
    }

    // ========================================
    // Parser
    // ========================================
    
    const ParseResultType = Object.freeze({
        MODIFY: 'modify',
        SET: 'set'
    });

    class StatParser {
        constructor(config = {}) {
            this.openTag = config.openTag || '{{';
            this.closeTag = config.closeTag || '}}';
            this.separator = config.separator || ':';
            this.caseSensitive = config.caseSensitive || false;
        }

        hasCommands(text) {
            if (!text || typeof text !== 'string') return false;
            const pattern = new RegExp(
                this._escapeRegex(this.openTag) + 
                '[^' + this._escapeRegex(this.closeTag.charAt(0)) + ']+' + 
                this._escapeRegex(this.closeTag),
                'g'
            );
            return pattern.test(text);
        }

        parseValid(text) {
            if (!text || typeof text !== 'string') return [];
            
            const results = [];
            const pattern = new RegExp(
                this._escapeRegex(this.openTag) + 
                '([^' + this._escapeRegex(this.closeTag.charAt(0)) + ']+)' + 
                this._escapeRegex(this.closeTag),
                'g'
            );

            let match;
            while ((match = pattern.exec(text)) !== null) {
                const content = match[1].trim();
                const sepIndex = content.indexOf(this.separator);
                
                if (sepIndex === -1) continue;

                const statId = content.substring(0, sepIndex).trim();
                let valueStr = content.substring(sepIndex + 1).trim();
                
                if (!statId || !valueStr) continue;

                let type = ParseResultType.MODIFY;
                
                if (valueStr.startsWith('=')) {
                    type = ParseResultType.SET;
                    valueStr = valueStr.substring(1);
                }

                const value = parseFloat(valueStr);
                if (isNaN(value)) continue;

                results.push({
                    statId: this.caseSensitive ? statId : statId.toLowerCase(),
                    value,
                    type,
                    raw: match[0]
                });
            }

            return results;
        }

        _escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        setConfig(config) {
            if (config.openTag) this.openTag = config.openTag;
            if (config.closeTag) this.closeTag = config.closeTag;
            if (config.separator) this.separator = config.separator;
            if (typeof config.caseSensitive === 'boolean') this.caseSensitive = config.caseSensitive;
        }
    }

    // ========================================
    // Token Modes
    // ========================================
    
    const TokenMode = Object.freeze({
        ZERO: 'zero',
        MINIMAL: 'minimal',
        FULL: 'full'
    });

    const StateScope = Object.freeze({
        GLOBAL: 'global',
        PER_CHAT: 'per_chat'
    });

    // ========================================
    // Default Settings
    // ========================================
    
    const DEFAULT_SETTINGS = Object.freeze({
        enabled: true,
        tokenMode: TokenMode.MINIMAL,
        stateScope: StateScope.PER_CHAT,
        showStatusWindow: true,
        autoApplyChanges: true,
        showChangeNotifications: true,
        parserConfig: {
            openTag: '{{',
            closeTag: '}}',
            separator: ':',
            caseSensitive: false
        }
    });

    // ========================================
    // State Manager
    // ========================================
    
    class StateManager {
        constructor() {
            this.currentState = null;
            this.globalState = null;
            this.settings = deepClone(DEFAULT_SETTINGS);
            this.parser = new StatParser(this.settings.parserConfig);
            this._stateChangeListeners = [];
            this._statChangeListeners = [];
            this._initialized = false;
        }

        getActiveState() {
            if (this.settings.stateScope === StateScope.GLOBAL) {
                return this.globalState;
            }
            return this.currentState;
        }

        initialize(context) {
            if (!context) {
                logError('StateManager.initialize: no context provided');
                return false;
            }

            try {
                this._loadSettings(context);
                this._loadGlobalState(context);
                this._loadStateForChat(context);
                this._initialized = true;
                log('StateManager initialized');
                return true;
            } catch (error) {
                logError('StateManager initialization failed:', error);
                return false;
            }
        }

        _loadSettings(context) {
            const { extensionSettings } = context;
            if (!extensionSettings[MODULE_NAME]) {
                extensionSettings[MODULE_NAME] = deepClone(DEFAULT_SETTINGS);
            }
            const saved = extensionSettings[MODULE_NAME];
            this.settings = { ...deepClone(DEFAULT_SETTINGS), ...saved };
            if (this.settings.parserConfig) {
                this.parser.setConfig(this.settings.parserConfig);
            }
        }

        _loadGlobalState(context) {
            const { extensionSettings } = context;
            const GLOBAL_STATE_KEY = 'simulation_builder_global';
            if (extensionSettings[GLOBAL_STATE_KEY]) {
                try {
                    this.globalState = SimulationState.fromJSON(extensionSettings[GLOBAL_STATE_KEY]);
                } catch (error) {
                    this.globalState = new SimulationState('global');
                }
            } else {
                this.globalState = new SimulationState('global');
                this.globalState.name = 'Global State';
            }
        }

        _loadStateForChat(context) {
            const { chatMetadata } = context;
            if (chatMetadata && chatMetadata[MODULE_NAME]) {
                try {
                    this.currentState = SimulationState.fromJSON(chatMetadata[MODULE_NAME]);
                } catch (error) {
                    this.currentState = new SimulationState();
                }
            } else {
                this.currentState = new SimulationState();
            }
        }

        saveSettings(context) {
            if (!context) return;
            const { extensionSettings, saveSettingsDebounced } = context;
            extensionSettings[MODULE_NAME] = deepClone(this.settings);
            if (typeof saveSettingsDebounced === 'function') {
                saveSettingsDebounced();
            }
        }

        saveGlobalState(context) {
            if (!context || !this.globalState) return;
            const { extensionSettings, saveSettingsDebounced } = context;
            const GLOBAL_STATE_KEY = 'simulation_builder_global';
            this.globalState.updatedAt = Date.now();
            extensionSettings[GLOBAL_STATE_KEY] = this.globalState.toJSON();
            if (typeof saveSettingsDebounced === 'function') {
                saveSettingsDebounced();
            }
        }

        async saveState(context) {
            if (!context || !this.currentState) return false;
            try {
                const { chatMetadata, saveMetadata } = context;
                this.currentState.updatedAt = Date.now();
                chatMetadata[MODULE_NAME] = this.currentState.toJSON();
                if (typeof saveMetadata === 'function') {
                    await saveMetadata();
                }
                return true;
            } catch (error) {
                logError('Failed to save state:', error);
                return false;
            }
        }

        processMessage(message) {
            const activeState = this.getActiveState();
            if (!activeState) {
                return { success: false, error: 'No active state', changes: [] };
            }
            if (!this.settings.enabled) {
                return { success: true, changes: [], disabled: true };
            }

            const commands = this.parser.parseValid(message);
            const changes = [];

            for (const cmd of commands) {
                const stat = activeState.statManager.get(cmd.statId);
                if (!stat) {
                    changes.push({ statId: cmd.statId, success: false, error: 'Stat not found' });
                    continue;
                }

                let result;
                if (cmd.type === ParseResultType.SET) {
                    result = stat.set(cmd.value);
                } else {
                    result = stat.modify(cmd.value);
                }

                changes.push({
                    statId: cmd.statId,
                    statName: stat.name,
                    success: true,
                    ...result,
                    commandType: cmd.type
                });

                this._notifyStatChange(stat, result);
            }

            return { success: true, changes, commandCount: commands.length };
        }

        tick() {
            const activeState = this.getActiveState();
            if (!activeState) {
                return { success: false, error: 'No active state' };
            }
            const result = activeState.tick();
            this._notifyStateChange('tick', result);
            return { success: true, ...result };
        }

        reset() {
            const activeState = this.getActiveState();
            if (!activeState) return;
            activeState.reset();
            this._notifyStateChange('reset', {});
        }

        setStateScope(scope) {
            if (scope === StateScope.GLOBAL || scope === StateScope.PER_CHAT) {
                this.settings.stateScope = scope;
                this._notifyStateChange('scope_changed', { scope });
            }
        }

        getVisibleStats() {
            const activeState = this.getActiveState();
            if (!activeState) return [];
            return activeState.statManager.getVisible();
        }

        onStateChange(listener) {
            if (typeof listener !== 'function') return () => {};
            this._stateChangeListeners.push(listener);
            return () => {
                const idx = this._stateChangeListeners.indexOf(listener);
                if (idx > -1) this._stateChangeListeners.splice(idx, 1);
            };
        }

        onStatChange(listener) {
            if (typeof listener !== 'function') return () => {};
            this._statChangeListeners.push(listener);
            return () => {
                const idx = this._statChangeListeners.indexOf(listener);
                if (idx > -1) this._statChangeListeners.splice(idx, 1);
            };
        }

        _notifyStateChange(eventType, data) {
            for (const listener of this._stateChangeListeners) {
                try { listener(eventType, data); } catch (e) { logError('State change listener error:', e); }
            }
        }

        _notifyStatChange(stat, result) {
            for (const listener of this._statChangeListeners) {
                try { listener(stat, result); } catch (e) { logError('Stat change listener error:', e); }
            }
        }

        exportState() {
            const activeState = this.getActiveState();
            if (!activeState) return '{}';
            return JSON.stringify(activeState.toJSON(), null, 2);
        }

        importState(jsonString) {
            const data = safeJsonParse(jsonString, null);
            if (!data) return false;
            try {
                this.currentState = SimulationState.fromJSON(data);
                this._notifyStateChange('import', {});
                return true;
            } catch (error) {
                logError('Import failed:', error);
                return false;
            }
        }
    }

    // ========================================
    // UI Controller
    // ========================================
    
    const UI_IDS = Object.freeze({
        CONTAINER: 'simbuilder-container',
        SETTINGS_PANEL: 'simbuilder-settings',
        STATUS_WINDOW: 'simbuilder-status',
        STAT_LIST: 'simbuilder-stat-list',
        NOTIFICATION: 'simbuilder-notification'
    });

    class UIController {
        constructor() {
            this.container = null;
            this.statusWindow = null;
            this.isStatusWindowVisible = true;
            this.isSettingsPanelOpen = false;
            this._unsubscribeStatChange = null;
            this._unsubscribeStateChange = null;
        }

        initialize(parentElement) {
            if (!parentElement) {
                logError('UIController: no parent element');
                return false;
            }

            try {
                this._createContainer(parentElement);
                this._createStatusWindow();
                this._setupListeners();
                this.render();
                log('UI initialized');
                return true;
            } catch (error) {
                logError('UI initialization failed:', error);
                return false;
            }
        }

        _createContainer(parent) {
            const existing = document.getElementById(UI_IDS.CONTAINER);
            if (existing) existing.remove();

            this.container = document.createElement('div');
            this.container.id = UI_IDS.CONTAINER;
            this.container.className = 'simbuilder-container';
            parent.appendChild(this.container);
        }

        _createStatusWindow() {
            this.statusWindow = document.createElement('div');
            this.statusWindow.id = UI_IDS.STATUS_WINDOW;
            this.statusWindow.className = 'simbuilder-status-window';

            const header = document.createElement('div');
            header.className = 'simbuilder-status-header';
            header.innerHTML = `
                <span class="simbuilder-status-title">📊 상태</span>
                <div class="simbuilder-status-controls">
                    <button class="simbuilder-btn simbuilder-btn-icon" data-action="settings" title="Settings">⚙️</button>
                    <button class="simbuilder-btn simbuilder-btn-icon" data-action="toggle" title="Toggle">▼</button>
                </div>
            `;

            const content = document.createElement('div');
            content.className = 'simbuilder-status-content';
            content.id = UI_IDS.STAT_LIST;

            this.statusWindow.appendChild(header);
            this.statusWindow.appendChild(content);
            this.container.appendChild(this.statusWindow);

            this._attachStatusWindowEvents();
        }

        _attachStatusWindowEvents() {
            this.statusWindow.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.dataset.action;
                switch (action) {
                    case 'toggle': this.toggleStatusWindow(); break;
                    case 'settings': this.toggleSettingsPanel(); break;
                }
            });
        }

        _setupListeners() {
            this._unsubscribeStatChange = stateManager.onStatChange((stat, result) => {
                this.updateStat(stat);
                if (stateManager.settings.showChangeNotifications) {
                    this.showStatChangeNotification(stat, result);
                }
            });

            this._unsubscribeStateChange = stateManager.onStateChange((eventType, data) => {
                if (eventType === 'new' || eventType === 'import' || eventType === 'reset') {
                    this.render();
                }
            });
        }

        render() {
            this.renderStatList();
            this.updateVisibility();
        }

        renderStatList() {
            const statList = document.getElementById(UI_IDS.STAT_LIST);
            if (!statList) return;

            const stats = stateManager.getVisibleStats();

            if (stats.length === 0) {
                statList.innerHTML = `
                    <div class="simbuilder-empty-state">
                        <p>통계가 설정되지 않았습니다</p>
                        <button class="simbuilder-btn simbuilder-btn-primary" data-action="add-stat">
                            + 통계 추가
                        </button>
                    </div>
                `;
                const addBtn = statList.querySelector('[data-action="add-stat"]');
                if (addBtn) {
                    addBtn.addEventListener('click', () => this.showAddStatDialog());
                }
                return;
            }

            statList.innerHTML = '';
            for (const stat of stats) {
                const statElement = this._createStatElement(stat);
                statList.appendChild(statElement);
            }

            const addButton = document.createElement('button');
            addButton.className = 'simbuilder-btn simbuilder-btn-add';
            addButton.textContent = '+ 통계 추가';
            addButton.addEventListener('click', () => this.showAddStatDialog());
            statList.appendChild(addButton);
        }

        _createStatElement(stat) {
            const element = document.createElement('div');
            element.className = 'simbuilder-stat';
            element.dataset.statId = stat.id;

            const percentage = stat.percentage;
            const displayValue = stat.getDisplayString();

            element.innerHTML = `
                <div class="simbuilder-stat-header">
                    <span class="simbuilder-stat-name">${this._escapeHtml(stat.name)}</span>
                    <span class="simbuilder-stat-value">${this._escapeHtml(displayValue)}</span>
                </div>
                <div class="simbuilder-stat-bar-container">
                    <div class="simbuilder-stat-bar" style="width: ${percentage}%; background-color: ${stat.color};"></div>
                </div>
                <div class="simbuilder-stat-controls">
                    <button class="simbuilder-btn simbuilder-btn-small" data-action="decrease" data-stat="${stat.id}">-</button>
                    <button class="simbuilder-btn simbuilder-btn-small" data-action="increase" data-stat="${stat.id}">+</button>
                    <button class="simbuilder-btn simbuilder-btn-small simbuilder-btn-edit" data-action="edit" data-stat="${stat.id}">✏️</button>
                </div>
            `;

            element.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const statId = btn.dataset.stat;
                    this._handleStatAction(action, statId);
                });
            });

            return element;
        }

        _handleStatAction(action, statId) {
            const activeState = stateManager.getActiveState();
            if (!activeState) return;

            const stat = activeState.statManager.get(statId);
            if (!stat) return;

            switch (action) {
                case 'increase':
                    stat.modify(1);
                    this.updateStat(stat);
                    break;
                case 'decrease':
                    stat.modify(-1);
                    this.updateStat(stat);
                    break;
                case 'edit':
                    this.showEditStatDialog(stat);
                    break;
            }
        }

        updateStat(stat) {
            const element = document.querySelector(`[data-stat-id="${stat.id}"]`);
            if (!element) {
                this.renderStatList();
                return;
            }

            const percentage = stat.percentage;
            const displayValue = stat.getDisplayString();

            const valueEl = element.querySelector('.simbuilder-stat-value');
            if (valueEl) valueEl.textContent = displayValue;

            const barEl = element.querySelector('.simbuilder-stat-bar');
            if (barEl) {
                barEl.style.width = `${percentage}%`;
                barEl.style.backgroundColor = stat.color;
            }

            element.classList.add('simbuilder-stat-changed');
            setTimeout(() => element.classList.remove('simbuilder-stat-changed'), 300);
        }

        showStatChangeNotification(stat, result) {
            const change = result.actualChange || result.newValue - result.oldValue;
            if (change === 0) return;
            const sign = change > 0 ? '+' : '';
            const message = `${stat.name}: ${sign}${change}`;
            this.showNotification(message, change > 0 ? 'positive' : 'negative');
        }

        showNotification(message, type = 'info') {
            const existing = document.getElementById(UI_IDS.NOTIFICATION);
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = UI_IDS.NOTIFICATION;
            notification.className = `simbuilder-notification simbuilder-notification-${type}`;
            notification.textContent = message;

            this.container.appendChild(notification);

            setTimeout(() => {
                notification.classList.add('simbuilder-notification-hide');
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }

        showAddStatDialog() {
            this._showStatDialog(null, '통계 추가', (data) => {
                const activeState = stateManager.getActiveState();
                if (!activeState) return;

                const stat = new Stat({
                    id: sanitizeId(data.name),
                    name: data.name,
                    baseValue: data.maxValue,
                    currentValue: data.currentValue,
                    minValue: data.minValue,
                    maxValue: data.maxValue,
                    color: data.color,
                    displayMode: data.displayMode
                });

                activeState.statManager.add(stat);
                this.renderStatList();
                this.showNotification(`추가됨: ${stat.name}`, 'positive');
            });
        }

        showEditStatDialog(stat) {
            this._showStatDialog(stat, '통계 편집', (data) => {
                stat.name = data.name;
                stat.setBounds(data.minValue, data.maxValue);
                stat.currentValue = data.currentValue;
                stat.color = data.color;
                stat.displayMode = data.displayMode;

                this.updateStat(stat);
                this.showNotification(`수정됨: ${stat.name}`, 'info');
            }, () => {
                const activeState = stateManager.getActiveState();
                if (!activeState) return;
                activeState.statManager.remove(stat.id);
                this.renderStatList();
                this.showNotification(`삭제됨: ${stat.name}`, 'negative');
            });
        }

        _showStatDialog(stat, title, onSave, onDelete = null) {
            const isEdit = stat !== null;
            const defaults = stat || {
                name: '',
                currentValue: 100,
                minValue: 0,
                maxValue: 100,
                color: '#4a90d9',
                displayMode: StatDisplayMode.FRACTION
            };

            const dialogHtml = `
                <div class="simbuilder-dialog-overlay" id="simbuilder-dialog">
                    <div class="simbuilder-dialog">
                        <div class="simbuilder-dialog-header">
                            <h3>${title}</h3>
                            <button class="simbuilder-btn simbuilder-btn-icon" data-action="close">✕</button>
                        </div>
                        <div class="simbuilder-dialog-content">
                            <div class="simbuilder-form-group">
                                <label>이름</label>
                                <input type="text" id="stat-name" value="${this._escapeHtml(defaults.name)}" placeholder="예: HP, MP, 스태미나">
                            </div>
                            <div class="simbuilder-form-row">
                                <div class="simbuilder-form-group">
                                    <label>현재값</label>
                                    <input type="number" id="stat-current" value="${defaults.currentValue}">
                                </div>
                                <div class="simbuilder-form-group">
                                    <label>최소</label>
                                    <input type="number" id="stat-min" value="${defaults.minValue}">
                                </div>
                                <div class="simbuilder-form-group">
                                    <label>최대</label>
                                    <input type="number" id="stat-max" value="${defaults.maxValue}">
                                </div>
                            </div>
                            <div class="simbuilder-form-row">
                                <div class="simbuilder-form-group">
                                    <label>색상</label>
                                    <input type="color" id="stat-color" value="${defaults.color}">
                                </div>
                                <div class="simbuilder-form-group">
                                    <label>표시</label>
                                    <select id="stat-display">
                                        <option value="value" ${defaults.displayMode === 'value' ? 'selected' : ''}>값</option>
                                        <option value="fraction" ${defaults.displayMode === 'fraction' ? 'selected' : ''}>분수</option>
                                        <option value="percent" ${defaults.displayMode === 'percent' ? 'selected' : ''}>퍼센트</option>
                                        <option value="bar" ${defaults.displayMode === 'bar' ? 'selected' : ''}>바</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="simbuilder-dialog-footer">
                            ${isEdit && onDelete ? '<button class="simbuilder-btn simbuilder-btn-danger" data-action="delete">삭제</button>' : ''}
                            <button class="simbuilder-btn" data-action="cancel">취소</button>
                            <button class="simbuilder-btn simbuilder-btn-primary" data-action="save">저장</button>
                        </div>
                    </div>
                </div>
            `;

            const dialogContainer = document.createElement('div');
            dialogContainer.innerHTML = dialogHtml;
            document.body.appendChild(dialogContainer.firstElementChild);

            const dialog = document.getElementById('simbuilder-dialog');
            const closeDialog = () => dialog.remove();

            dialog.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (!action) return;

                switch (action) {
                    case 'close':
                    case 'cancel':
                        closeDialog();
                        break;
                    case 'save':
                        const name = document.getElementById('stat-name').value.trim();
                        if (!name) {
                            this.showNotification('이름을 입력하세요', 'negative');
                            return;
                        }
                        onSave({
                            name,
                            currentValue: toNumber(document.getElementById('stat-current').value, 100),
                            minValue: toNumber(document.getElementById('stat-min').value, 0),
                            maxValue: toNumber(document.getElementById('stat-max').value, 100),
                            color: document.getElementById('stat-color').value,
                            displayMode: document.getElementById('stat-display').value
                        });
                        closeDialog();
                        break;
                    case 'delete':
                        if (onDelete) {
                            onDelete();
                            closeDialog();
                        }
                        break;
                }
            });

            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) closeDialog();
            });
        }

        toggleStatusWindow() {
            const content = this.statusWindow.querySelector('.simbuilder-status-content');
            const toggleBtn = this.statusWindow.querySelector('[data-action="toggle"]');

            this.isStatusWindowVisible = !this.isStatusWindowVisible;

            if (content) {
                content.style.display = this.isStatusWindowVisible ? 'block' : 'none';
            }
            if (toggleBtn) {
                toggleBtn.textContent = this.isStatusWindowVisible ? '▼' : '▲';
            }
        }

        toggleSettingsPanel() {
            this.isSettingsPanelOpen = !this.isSettingsPanelOpen;

            if (this.isSettingsPanelOpen) {
                this._showSettingsPanel();
            } else {
                this._hideSettingsPanel();
            }
        }

        _showSettingsPanel() {
            const existing = document.getElementById(UI_IDS.SETTINGS_PANEL);
            if (existing) existing.remove();

            const settings = stateManager.settings;

            const panel = document.createElement('div');
            panel.id = UI_IDS.SETTINGS_PANEL;
            panel.className = 'simbuilder-settings-panel';
            panel.innerHTML = `
                <div class="simbuilder-settings-header">
                    <h4>⚙️ 설정</h4>
                </div>
                <div class="simbuilder-settings-content">
                    <div class="simbuilder-form-group">
                        <label>
                            <input type="checkbox" id="setting-enabled" ${settings.enabled ? 'checked' : ''}>
                            시뮬레이션 활성화
                        </label>
                    </div>

                    <div class="simbuilder-form-group">
                        <label>토큰 모드</label>
                        <select id="setting-token-mode" class="simbuilder-select">
                            <option value="zero" ${settings.tokenMode === 'zero' ? 'selected' : ''}>Zero (0 토큰)</option>
                            <option value="minimal" ${settings.tokenMode === 'minimal' ? 'selected' : ''}>최소 (~30 토큰)</option>
                            <option value="full" ${settings.tokenMode === 'full' ? 'selected' : ''}>전체 (~100 토큰)</option>
                        </select>
                    </div>

                    <div class="simbuilder-form-group">
                        <label>
                            <input type="checkbox" id="setting-notifications" ${settings.showChangeNotifications ? 'checked' : ''}>
                            변경 알림 표시
                        </label>
                    </div>

                    <hr class="simbuilder-divider" />

                    <div class="simbuilder-form-group">
                        <label>상태 범위</label>
                        <select id="setting-scope" class="simbuilder-select">
                            <option value="per_chat" ${settings.stateScope === 'per_chat' ? 'selected' : ''}>채팅별 (분리)</option>
                            <option value="global" ${settings.stateScope === 'global' ? 'selected' : ''}>전역 (공유)</option>
                        </select>
                        <small class="simbuilder-help-text">전역: 모든 채팅에서 동일한 통계. 채팅별: 채팅마다 다른 통계.</small>
                    </div>

                    <hr class="simbuilder-divider" />

                    <div class="simbuilder-settings-actions">
                        <button class="simbuilder-btn" data-action="export">내보내기</button>
                        <button class="simbuilder-btn" data-action="import">가져오기</button>
                        <button class="simbuilder-btn simbuilder-btn-danger" data-action="reset">초기화</button>
                    </div>
                </div>
            `;

            this.container.appendChild(panel);

            panel.querySelector('#setting-enabled').addEventListener('change', (e) => {
                settings.enabled = e.target.checked;
                this._saveSettings();
                this.updateVisibility();
            });

            panel.querySelector('#setting-token-mode').addEventListener('change', (e) => {
                settings.tokenMode = e.target.value;
                this._saveSettings();
            });

            panel.querySelector('#setting-notifications').addEventListener('change', (e) => {
                settings.showChangeNotifications = e.target.checked;
                this._saveSettings();
            });

            panel.querySelector('#setting-scope').addEventListener('change', (e) => {
                stateManager.setStateScope(e.target.value);
                this._saveSettings();
                this.render();
                this.showNotification(`범위: ${e.target.value === 'global' ? '전역' : '채팅별'}`, 'info');
            });

            panel.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    switch (btn.dataset.action) {
                        case 'export': this._exportState(); break;
                        case 'import': this._importState(); break;
                        case 'reset': this._resetState(); break;
                    }
                });
            });
        }

        _hideSettingsPanel() {
            const panel = document.getElementById(UI_IDS.SETTINGS_PANEL);
            if (panel) panel.remove();
        }

        _saveSettings() {
            const context = getContext();
            if (context) {
                stateManager.saveSettings(context);
            }
        }

        _exportState() {
            const json = stateManager.exportState();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `simulation-${Date.now()}.json`;
            a.click();

            URL.revokeObjectURL(url);
            this.showNotification('내보내기 완료', 'positive');
        }

        _importState() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    if (stateManager.importState(text)) {
                        this.render();
                        this.showNotification('가져오기 완료', 'positive');
                    } else {
                        this.showNotification('가져오기 실패', 'negative');
                    }
                } catch (error) {
                    logError('Import error:', error);
                    this.showNotification('가져오기 실패', 'negative');
                }
            });

            input.click();
        }

        _resetState() {
            if (confirm('정말 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                stateManager.reset();
                this.render();
                this.showNotification('초기화 완료', 'info');
            }
        }

        updateVisibility() {
            if (!this.statusWindow) return;
            const shouldShow = stateManager.settings.showStatusWindow && stateManager.settings.enabled;
            this.statusWindow.style.display = shouldShow ? 'block' : 'none';
        }

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    }

    // ========================================
    // Global Instances
    // ========================================
    
    const stateManager = new StateManager();
    const uiController = new UIController();

    // ========================================
    // Context Helper
    // ========================================
    
    function getContext() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                return SillyTavern.getContext();
            }
        } catch (e) {
            logError('Failed to get context:', e);
        }
        return null;
    }

    // ========================================
    // Slash Commands
    // ========================================
    
    function registerSlashCommands() {
        const context = getContext();
        if (!context) return;

        try {
            if (typeof SlashCommandParser === 'undefined' || typeof SlashCommand === 'undefined') {
                log('SlashCommandParser not available, skipping command registration');
                return;
            }

            // /simstat - show stats
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'simstat',
                callback: (args, value) => {
                    const stats = stateManager.getVisibleStats();
                    if (stats.length === 0) {
                        return '통계가 설정되지 않았습니다.';
                    }
                    return stats.map(s => `${s.name}: ${s.getDisplayString()}`).join('\n');
                },
                returns: 'Current stat values',
                helpString: '모든 통계를 표시합니다.'
            }));

            // /simset - set stat value
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'simset',
                callback: (args, value) => {
                    const activeState = stateManager.getActiveState();
                    if (!activeState) {
                        return '활성 시뮬레이션이 없습니다.';
                    }

                    const parts = value.split(/\s+/);
                    if (parts.length < 2) {
                        return '사용법: /simset <statId> <value>';
                    }

                    const statId = parts[0].toLowerCase();
                    const newValue = parseFloat(parts[1]);

                    if (isNaN(newValue)) {
                        return '잘못된 값입니다.';
                    }

                    const stat = activeState.statManager.get(statId);
                    if (!stat) {
                        return `통계를 찾을 수 없음: ${statId}`;
                    }

                    const result = stat.set(newValue);
                    uiController.updateStat(stat);
                    
                    return `${stat.name}: ${result.oldValue} → ${result.newValue}`;
                },
                returns: 'Result of stat change',
                helpString: '통계를 특정 값으로 설정합니다. 사용법: /simset hp 50'
            }));

            // /simmod - modify stat
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'simmod',
                callback: (args, value) => {
                    const activeState = stateManager.getActiveState();
                    if (!activeState) {
                        return '활성 시뮬레이션이 없습니다.';
                    }

                    const parts = value.split(/\s+/);
                    if (parts.length < 2) {
                        return '사용법: /simmod <statId> <delta>';
                    }

                    const statId = parts[0].toLowerCase();
                    const delta = parseFloat(parts[1]);

                    if (isNaN(delta)) {
                        return '잘못된 값입니다.';
                    }

                    const stat = activeState.statManager.get(statId);
                    if (!stat) {
                        return `통계를 찾을 수 없음: ${statId}`;
                    }

                    const result = stat.modify(delta);
                    uiController.updateStat(stat);
                    
                    const sign = delta >= 0 ? '+' : '';
                    return `${stat.name}: ${sign}${delta} (${result.oldValue} → ${result.newValue})`;
                },
                returns: 'Result of stat modification',
                helpString: '통계를 증감합니다. 사용법: /simmod hp -10'
            }));

            // /simreset - reset simulation
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'simreset',
                callback: () => {
                    stateManager.reset();
                    uiController.render();
                    return '시뮬레이션이 초기화되었습니다.';
                },
                returns: 'Confirmation message',
                helpString: '모든 통계를 기본값으로 초기화합니다.'
            }));

            // /simadd - quick add stat
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'simadd',
                callback: (args, value) => {
                    const activeState = stateManager.getActiveState();
                    if (!activeState) {
                        return '활성 시뮬레이션이 없습니다.';
                    }

                    const parts = value.split(/\s+/);
                    if (parts.length < 1 || !parts[0]) {
                        return '사용법: /simadd <name> [max] [current]';
                    }

                    const name = parts[0];
                    const maxVal = parts[1] ? parseFloat(parts[1]) : 100;
                    const currentVal = parts[2] ? parseFloat(parts[2]) : maxVal;

                    const stat = new Stat({
                        id: sanitizeId(name),
                        name: name,
                        baseValue: maxVal,
                        currentValue: currentVal,
                        minValue: 0,
                        maxValue: maxVal
                    });

                    activeState.statManager.add(stat);
                    uiController.renderStatList();
                    
                    return `추가됨: ${stat.name} (${currentVal}/${maxVal})`;
                },
                returns: 'Confirmation message',
                helpString: '새 통계를 추가합니다. 사용법: /simadd 힘 10 5'
            }));

            log('Slash commands registered');
        } catch (error) {
            logError('Failed to register slash commands:', error);
        }
    }

    // ========================================
    // Event Handlers
    // ========================================
    
    async function onMessageReceived(messageIndex) {
        const context = getContext();
        if (!context) return;

        try {
            const chat = context.chat;
            if (!chat || !chat[messageIndex]) return;

            const message = chat[messageIndex];
            if (message.is_user) return;

            const messageText = message.mes || '';
            if (!stateManager.parser.hasCommands(messageText)) return;

            log('Processing message with stat commands');
            const result = stateManager.processMessage(messageText);

            if (result.success && result.changes.length > 0) {
                log(`Applied ${result.changes.length} stat changes`);
                await stateManager.saveState(context);
                stateManager.tick();
            }
        } catch (error) {
            logError('Error processing message:', error);
        }
    }

    async function onChatChanged() {
        const context = getContext();
        if (!context) return;

        try {
            log('Chat changed, reloading state');
            stateManager.initialize(context);
            uiController.render();
        } catch (error) {
            logError('Error on chat change:', error);
        }
    }

    // ========================================
    // Settings Panel HTML
    // ========================================
    
    function getSettingsPanelHtml() {
        return `
            <div class="simbuilder-extension-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Simulation Builder</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="simbuilder-settings-row">
                            <label for="simbuilder_enabled">
                                <input type="checkbox" id="simbuilder_enabled" />
                                시뮬레이션 빌더 활성화
                            </label>
                        </div>
                        <div class="simbuilder-settings-row">
                            <label for="simbuilder_token_mode">토큰 모드:</label>
                            <select id="simbuilder_token_mode">
                                <option value="zero">Zero (0 토큰)</option>
                                <option value="minimal">최소 (~30 토큰)</option>
                                <option value="full">전체 (~100+ 토큰)</option>
                            </select>
                        </div>
                        <div class="simbuilder-settings-row">
                            <label for="simbuilder_scope">상태 범위:</label>
                            <select id="simbuilder_scope">
                                <option value="per_chat">채팅별 (분리)</option>
                                <option value="global">전역 (공유)</option>
                            </select>
                        </div>
                        <div class="simbuilder-settings-row">
                            <label for="simbuilder_notifications">
                                <input type="checkbox" id="simbuilder_notifications" />
                                변경 알림 표시
                            </label>
                        </div>
                        <hr />
                        <div class="simbuilder-settings-info">
                            <p>버전: ${VERSION}</p>
                            <p>형식: <code>{{stat:value}}</code></p>
                            <p>예시:</p>
                            <ul>
                                <li><code>{{hp:-10}}</code> - HP 10 감소</li>
                                <li><code>{{mp:+5}}</code> - MP 5 증가</li>
                                <li><code>{{hp:=50}}</code> - HP를 50으로 설정</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function bindSettingsPanelEvents() {
        const context = getContext();
        if (!context) return;

        const enabledCheckbox = document.getElementById('simbuilder_enabled');
        const tokenModeSelect = document.getElementById('simbuilder_token_mode');
        const scopeSelect = document.getElementById('simbuilder_scope');
        const notificationsCheckbox = document.getElementById('simbuilder_notifications');

        if (enabledCheckbox) {
            enabledCheckbox.checked = stateManager.settings.enabled;
            enabledCheckbox.addEventListener('change', () => {
                stateManager.settings.enabled = enabledCheckbox.checked;
                stateManager.saveSettings(context);
                uiController.updateVisibility();
            });
        }

        if (tokenModeSelect) {
            tokenModeSelect.value = stateManager.settings.tokenMode;
            tokenModeSelect.addEventListener('change', () => {
                stateManager.settings.tokenMode = tokenModeSelect.value;
                stateManager.saveSettings(context);
            });
        }

        if (scopeSelect) {
            scopeSelect.value = stateManager.settings.stateScope || 'per_chat';
            scopeSelect.addEventListener('change', () => {
                stateManager.setStateScope(scopeSelect.value);
                stateManager.saveSettings(context);
                uiController.render();
            });
        }

        if (notificationsCheckbox) {
            notificationsCheckbox.checked = stateManager.settings.showChangeNotifications;
            notificationsCheckbox.addEventListener('change', () => {
                stateManager.settings.showChangeNotifications = notificationsCheckbox.checked;
                stateManager.saveSettings(context);
            });
        }
    }

    // ========================================
    // Initialize Extension
    // ========================================
    
    async function initExtension() {
        log(`Initializing v${VERSION}...`);

        const context = getContext();
        if (!context) {
            logError('No SillyTavern context available');
            return;
        }

        try {
            const { eventSource, event_types } = context;

            if (!stateManager.initialize(context)) {
                logError('Failed to initialize state manager');
                return;
            }

            let uiParent = document.getElementById('extensions_settings2');
            if (!uiParent) uiParent = document.getElementById('chat');
            if (!uiParent) uiParent = document.body;

            if (!uiController.initialize(uiParent)) {
                logError('Failed to initialize UI');
                return;
            }

            const settingsContainer = document.getElementById('extensions_settings');
            if (settingsContainer) {
                const settingsHtml = getSettingsPanelHtml();
                const settingsDiv = document.createElement('div');
                settingsDiv.innerHTML = settingsHtml;
                settingsContainer.appendChild(settingsDiv.firstElementChild);
                bindSettingsPanelEvents();
            }

            if (eventSource && event_types) {
                eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
                eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
                log('Event listeners registered');
            }

            log('Initialization complete');

        } catch (error) {
            logError('Initialization failed:', error);
        }
    }

    // ========================================
    // Entry Point
    // ========================================
    
    if (typeof jQuery !== 'undefined') {
        jQuery(async () => {
            await initExtension();
        });
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtension);
    } else {
        initExtension();
    }

})();
