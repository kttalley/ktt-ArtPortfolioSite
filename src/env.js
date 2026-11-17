// True while prerendering in Node. The browser build always sees false.
export const IS_SERVER = typeof window === 'undefined'
