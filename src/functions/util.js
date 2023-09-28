import { join as joinPath } from 'node:path';

/**
 * Checks that a string is a valid URL.
 * @param {string|URL} url - The URL to check.
 * @param {boolean} [throwOnInvalid=true] - Whether to throw an error if the URL is invalid. 
 * @returns {boolean} Whether the URL is valid.
 * @throws {Error} If the URL is invalid and `throwOnInvalid` is `true`.
 */
function verifyURL(url, throwOnInvalid = true) {
    try {
        new URL(url);
        return true;
    }
    catch (err) {
        if (throwOnInvalid)
            throw new Error("Invalid URL " + url, { cause: err });
        return false;
    }
}

/**
 * Appends a path to a URL.
 * @param {string|URL} url - The URL to append to.
 * @param {string[]} paths - The path(s) to append.
 * @returns {URL} The new URL.
 */
function appendPath(url, ...paths) {
    const urlObj = new URL(url);
    for (const path of paths) {
        const url = new URL(path, 'https://example.com');
        urlObj.pathname = joinPath(urlObj.pathname, url.pathname);
        if(url.search) {
            urlObj.search = url.search;
        }
    }
    return urlObj;
}


/**
 * Creates a promise and returns it along with its `resolve` and `reject` functions.
 * @returns {{promise: Promise, resolve: function, reject: function}} The promise and its `resolve` and `reject` functions.
 */
function externalPromise() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}


export {
    verifyURL,
    externalPromise,
    appendPath,
}