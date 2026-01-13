/**
 * Simulation Builder - Utility Functions
 * Provides validation, sanitization, and helper functions
 * @module Utils
 */

/**
 * Validates that a value is a finite number
 * @param {*} value - Value to check
 * @param {number} [defaultValue=0] - Default if invalid
 * @returns {number} Validated number
 */
export function toNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        console.warn(`[SimBuilder] Invalid number: ${value}, using default: ${defaultValue}`);
        return defaultValue;
    }
    return num;
}

/**
 * Validates that a value is a non-negative integer
 * @param {*} value - Value to check
 * @param {number} [defaultValue=0] - Default if invalid
 * @returns {number} Validated non-negative integer
 */
export function toNonNegativeInt(value, defaultValue = 0) {
    const num = toNumber(value, defaultValue);
    const result = Math.max(0, Math.floor(num));
    return result;
}

/**
 * Validates that a value is a positive integer (>= 1)
 * @param {*} value - Value to check
 * @param {number} [defaultValue=1] - Default if invalid
 * @returns {number} Validated positive integer
 */
export function toPositiveInt(value, defaultValue = 1) {
    const num = toNumber(value, defaultValue);
    const result = Math.max(1, Math.floor(num));
    return result;
}

/**
 * Clamps a number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    const num = toNumber(value, min);
    const safeMin = toNumber(min, 0);
    const safeMax = toNumber(max, 100);
    if (safeMin > safeMax) {
        console.warn(`[SimBuilder] clamp: min (${safeMin}) > max (${safeMax}), swapping`);
        return Math.min(Math.max(num, safeMax), safeMin);
    }
    return Math.min(Math.max(num, safeMin), safeMax);
}

/**
 * Safely converts value to string
 * @param {*} value - Value to convert
 * @param {string} [defaultValue=''] - Default if invalid
 * @returns {string} String value
 */
export function toString(value, defaultValue = '') {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return String(value);
}

/**
 * Validates string is not empty after trimming
 * @param {*} value - Value to check
 * @returns {boolean} True if non-empty string
 */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Sanitizes a string ID (alphanumeric, underscore, hyphen only)
 * @param {string} id - ID to sanitize
 * @returns {string} Sanitized ID
 */
export function sanitizeId(id) {
    if (!isNonEmptyString(id)) {
        return 'unnamed_' + Date.now();
    }
    // Replace invalid chars with underscore, collapse multiple underscores
    return String(id)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Deep clones an object safely
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    try {
        return structuredClone(obj);
    } catch (e) {
        // Fallback for objects that can't be cloned
        console.warn('[SimBuilder] structuredClone failed, using JSON fallback');
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e2) {
            console.error('[SimBuilder] Deep clone failed:', e2);
            return obj;
        }
    }
}

/**
 * Safely parses JSON with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} [defaultValue=null] - Default if parse fails
 * @returns {*} Parsed object or default
 */
export function safeJsonParse(jsonString, defaultValue = null) {
    if (!isNonEmptyString(jsonString)) {
        return defaultValue;
    }
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn('[SimBuilder] JSON parse failed:', e.message);
        return defaultValue;
    }
}

/**
 * Generates a unique ID
 * @param {string} [prefix='id'] - Prefix for the ID
 * @returns {string} Unique ID
 */
export function generateId(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout = null;
    return function (...args) {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func.apply(this, args);
            timeout = null;
        }, toPositiveInt(wait, 100));
    };
}

/**
 * Checks if value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean} True if plain object
 */
export function isPlainObject(value) {
    return value !== null && 
           typeof value === 'object' && 
           !Array.isArray(value) &&
           Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Safely gets a nested property
 * @param {object} obj - Object to query
 * @param {string} path - Dot-separated path
 * @param {*} [defaultValue=undefined] - Default if not found
 * @returns {*} Value at path or default
 */
export function getNestedValue(obj, path, defaultValue = undefined) {
    if (!isPlainObject(obj) || !isNonEmptyString(path)) {
        return defaultValue;
    }
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, key)) {
            return defaultValue;
        }
        current = current[key];
    }
    return current;
}

/**
 * Creates a frozen default settings object
 * @param {object} defaults - Default values
 * @returns {Readonly<object>} Frozen object
 */
export function createDefaults(defaults) {
    if (!isPlainObject(defaults)) {
        console.warn('[SimBuilder] createDefaults: not a plain object');
        return Object.freeze({});
    }
    return Object.freeze(deepClone(defaults));
}

/**
 * Validates an array of items
 * @param {*} arr - Array to validate
 * @param {Function} [validator] - Optional validator function for each item
 * @returns {Array} Validated array (empty if invalid)
 */
export function toArray(arr, validator = null) {
    if (!Array.isArray(arr)) {
        return [];
    }
    if (typeof validator === 'function') {
        return arr.filter(item => {
            try {
                return validator(item);
            } catch (e) {
                return false;
            }
        });
    }
    return [...arr];
}

/**
 * Safe arithmetic to avoid floating point issues
 */
export const SafeMath = {
    /**
     * Adds two numbers safely
     * @param {number} a - First number
     * @param {number} b - Second number
     * @returns {number} Sum
     */
    add(a, b) {
        const numA = toNumber(a, 0);
        const numB = toNumber(b, 0);
        // Round to 10 decimal places to avoid floating point issues
        return Math.round((numA + numB) * 1e10) / 1e10;
    },

    /**
     * Subtracts two numbers safely
     * @param {number} a - First number
     * @param {number} b - Second number
     * @returns {number} Difference
     */
    subtract(a, b) {
        const numA = toNumber(a, 0);
        const numB = toNumber(b, 0);
        return Math.round((numA - numB) * 1e10) / 1e10;
    },

    /**
     * Multiplies two numbers safely
     * @param {number} a - First number
     * @param {number} b - Second number
     * @returns {number} Product
     */
    multiply(a, b) {
        const numA = toNumber(a, 0);
        const numB = toNumber(b, 0);
        return Math.round((numA * numB) * 1e10) / 1e10;
    },

    /**
     * Divides two numbers safely
     * @param {number} a - Dividend
     * @param {number} b - Divisor
     * @param {number} [defaultValue=0] - Value if division by zero
     * @returns {number} Quotient
     */
    divide(a, b, defaultValue = 0) {
        const numA = toNumber(a, 0);
        const numB = toNumber(b, 0);
        if (numB === 0) {
            console.warn('[SimBuilder] Division by zero, returning default');
            return toNumber(defaultValue, 0);
        }
        return Math.round((numA / numB) * 1e10) / 1e10;
    },

    /**
     * Calculates percentage safely
     * @param {number} value - Current value
     * @param {number} max - Maximum value
     * @returns {number} Percentage (0-100)
     */
    percentage(value, max) {
        const result = this.divide(value, max, 0) * 100;
        return clamp(result, 0, 100);
    }
};

/**
 * Error boundary wrapper for functions
 * @param {Function} fn - Function to wrap
 * @param {*} [fallback=null] - Fallback value on error
 * @param {string} [context='Unknown'] - Context for error logging
 * @returns {Function} Wrapped function
 */
export function withErrorBoundary(fn, fallback = null, context = 'Unknown') {
    return function (...args) {
        try {
            const result = fn.apply(this, args);
            // Handle promises
            if (result instanceof Promise) {
                return result.catch(error => {
                    console.error(`[SimBuilder] Error in ${context}:`, error);
                    return fallback;
                });
            }
            return result;
        } catch (error) {
            console.error(`[SimBuilder] Error in ${context}:`, error);
            return fallback;
        }
    };
}

// Export module name for debugging
export const MODULE_NAME = 'simulation_builder';
