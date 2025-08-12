// => engine/utils/fetch.sys.mjs
// ===========================================================
// This module allows Sine to fetch urls on any internal page
// by using a background-module, bypassing the CSP.
// ===========================================================

export default async (url, forceText=false) => {
    const parseJSON = response => {
        try {
            if (!forceText) {
                response = JSON.parse(response);
            }
        } catch {}
        return response;
    }

    const response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
    return parseJSON(response);
};