/**
 * Simulation Builder - Parser System
 * Parses AI output for stat commands: {{stat:value}}
 * @module Parser
 */

import {
    toNumber,
    toString,
    isNonEmptyString,
    sanitizeId,
    isPlainObject
} from './Utils.js';

/**
 * Parser result types
 * @readonly
 * @enum {string}
 */
export const ParseResultType = Object.freeze({
    MODIFY: 'modify',     // {{hp:-10}} or {{hp:+10}}
    SET: 'set',           // {{hp:=50}}
    INVALID: 'invalid'    // Parsing failed
});

/**
 * Represents a single parsed command
 * @typedef {object} ParsedCommand
 * @property {string} raw - Original matched string
 * @property {string} statId - Stat identifier
 * @property {number} value - Numeric value
 * @property {ParseResultType} type - Command type
 * @property {boolean} isValid - Whether parsing succeeded
 * @property {string} [error] - Error message if invalid
 */

/**
 * Main parser for extracting stat commands from text
 * @class
 */
export class StatParser {
    /**
     * Creates a new StatParser
     * @param {object} [options={}] - Parser options
     * @param {string} [options.openTag='{{'] - Opening tag
     * @param {string} [options.closeTag='}}'] - Closing tag
     * @param {string} [options.separator=':'] - Stat/value separator
     * @param {boolean} [options.caseSensitive=false] - Case sensitive stat IDs
     */
    constructor(options = {}) {
        this.openTag = toString(options.openTag, '{{');
        this.closeTag = toString(options.closeTag, '}}');
        this.separator = toString(options.separator, ':');
        this.caseSensitive = options.caseSensitive === true;

        // Build regex pattern
        this._buildPattern();
    }

    /**
     * Builds the regex pattern for matching commands
     * @private
     */
    _buildPattern() {
        // Escape special regex characters
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const open = escapeRegex(this.openTag);
        const close = escapeRegex(this.closeTag);
        const sep = escapeRegex(this.separator);

        // Pattern: {{statId:value}}
        // statId: alphanumeric, underscore, hyphen
        // value: optional +/-, optional =, number (with optional decimal)
        this._pattern = new RegExp(
            `${open}\\s*([a-zA-Z_][a-zA-Z0-9_\\-]*)\\s*${sep}\\s*([=+\\-]?\\s*-?[0-9]+(?:\\.[0-9]+)?)\\s*${close}`,
            'g'
        );
    }

    /**
     * Parses a single command string
     * @param {string} raw - Raw command string
     * @param {string} statId - Stat identifier
     * @param {string} valueStr - Value string
     * @returns {ParsedCommand} Parsed command
     */
    _parseCommand(raw, statId, valueStr) {
        const result = {
            raw: toString(raw, ''),
            statId: '',
            value: 0,
            type: ParseResultType.INVALID,
            isValid: false,
            error: ''
        };

        // Validate stat ID
        if (!isNonEmptyString(statId)) {
            result.error = 'Empty stat ID';
            return result;
        }

        result.statId = this.caseSensitive ? statId.trim() : statId.trim().toLowerCase();

        // Parse value string
        const trimmedValue = toString(valueStr, '').replace(/\s/g, '');
        
        if (!trimmedValue) {
            result.error = 'Empty value';
            return result;
        }

        // Check for SET operation (=)
        if (trimmedValue.startsWith('=')) {
            result.type = ParseResultType.SET;
            const numStr = trimmedValue.substring(1);
            result.value = toNumber(numStr, NaN);
        } else {
            // MODIFY operation (+, -, or just number)
            result.type = ParseResultType.MODIFY;
            result.value = toNumber(trimmedValue, NaN);
        }

        // Validate the parsed number
        if (!Number.isFinite(result.value)) {
            result.error = `Invalid number: ${valueStr}`;
            result.type = ParseResultType.INVALID;
            return result;
        }

        result.isValid = true;
        return result;
    }

    /**
     * Parses text and extracts all stat commands
     * @param {string} text - Text to parse
     * @returns {ParsedCommand[]} Array of parsed commands
     */
    parse(text) {
        const results = [];
        
        if (!isNonEmptyString(text)) {
            return results;
        }

        // Reset regex lastIndex
        this._pattern.lastIndex = 0;

        let match;
        while ((match = this._pattern.exec(text)) !== null) {
            const [fullMatch, statId, valueStr] = match;
            const parsed = this._parseCommand(fullMatch, statId, valueStr);
            results.push(parsed);
        }

        return results;
    }

    /**
     * Parses text and returns only valid commands
     * @param {string} text - Text to parse
     * @returns {ParsedCommand[]} Array of valid parsed commands
     */
    parseValid(text) {
        return this.parse(text).filter(cmd => cmd.isValid);
    }

    /**
     * Checks if text contains any stat commands
     * @param {string} text - Text to check
     * @returns {boolean} True if contains commands
     */
    hasCommands(text) {
        if (!isNonEmptyString(text)) {
            return false;
        }
        this._pattern.lastIndex = 0;
        return this._pattern.test(text);
    }

    /**
     * Removes all stat commands from text
     * @param {string} text - Text to clean
     * @returns {string} Text without commands
     */
    stripCommands(text) {
        if (!isNonEmptyString(text)) {
            return '';
        }
        return text.replace(this._pattern, '').trim();
    }

    /**
     * Gets a summary of all stat changes from text
     * First match rule: if same stat appears multiple times, first one wins
     * @param {string} text - Text to parse
     * @returns {Map<string, ParsedCommand>} Map of statId to command
     */
    getStatChanges(text) {
        const changes = new Map();
        const commands = this.parseValid(text);

        for (const cmd of commands) {
            // First match rule
            if (!changes.has(cmd.statId)) {
                changes.set(cmd.statId, cmd);
            }
        }

        return changes;
    }

    /**
     * Creates a formatted command string
     * @param {string} statId - Stat ID
     * @param {number} value - Value
     * @param {ParseResultType} [type=ParseResultType.MODIFY] - Command type
     * @returns {string} Formatted command
     */
    formatCommand(statId, value, type = ParseResultType.MODIFY) {
        const id = this.caseSensitive ? statId : toString(statId, '').toLowerCase();
        const num = toNumber(value, 0);
        
        let valueStr;
        if (type === ParseResultType.SET) {
            valueStr = `=${num}`;
        } else {
            // For modify, include + for positive numbers
            valueStr = num >= 0 ? `+${num}` : `${num}`;
        }

        return `${this.openTag}${id}${this.separator}${valueStr}${this.closeTag}`;
    }

    /**
     * Validates a stat ID format
     * @param {string} statId - Stat ID to validate
     * @returns {boolean} True if valid format
     */
    isValidStatId(statId) {
        if (!isNonEmptyString(statId)) {
            return false;
        }
        // Must start with letter or underscore, contain only alphanumeric, underscore, hyphen
        return /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(statId);
    }

    /**
     * Gets parser configuration
     * @returns {object} Configuration object
     */
    getConfig() {
        return {
            openTag: this.openTag,
            closeTag: this.closeTag,
            separator: this.separator,
            caseSensitive: this.caseSensitive
        };
    }

    /**
     * Updates parser configuration
     * @param {object} options - New options
     */
    setConfig(options) {
        if (!isPlainObject(options)) {
            return;
        }
        
        if (isNonEmptyString(options.openTag)) {
            this.openTag = options.openTag;
        }
        if (isNonEmptyString(options.closeTag)) {
            this.closeTag = options.closeTag;
        }
        if (isNonEmptyString(options.separator)) {
            this.separator = options.separator;
        }
        if (typeof options.caseSensitive === 'boolean') {
            this.caseSensitive = options.caseSensitive;
        }

        this._buildPattern();
    }
}

/**
 * Singleton parser instance with default settings
 */
export const defaultParser = new StatParser();

/**
 * Convenience function to parse text with default parser
 * @param {string} text - Text to parse
 * @returns {ParsedCommand[]} Parsed commands
 */
export function parseStatCommands(text) {
    return defaultParser.parseValid(text);
}

/**
 * Convenience function to get stat changes map
 * @param {string} text - Text to parse
 * @returns {Map<string, ParsedCommand>} Stat changes
 */
export function getStatChanges(text) {
    return defaultParser.getStatChanges(text);
}

/**
 * Convenience function to strip commands from text
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function stripStatCommands(text) {
    return defaultParser.stripCommands(text);
}

export default { 
    StatParser, 
    ParseResultType, 
    defaultParser,
    parseStatCommands,
    getStatChanges,
    stripStatCommands
};
