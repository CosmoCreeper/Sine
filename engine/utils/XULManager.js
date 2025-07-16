// => engine/utils/XULManager.js
// ===========================================================
// This module allows Sine to append XUL elements to the
// DOM without the need for document.createElement calls.
// ===========================================================

const appendXUL = (parentElement, xulString, insertBefore=null, XUL=false) => {
    let element;
    if (XUL) {
        element = window.MozXULElement.parseXULToFragment(xulString);
    } else {
        element = new DOMParser().parseFromString(xulString, "text/html");
        if (element.body.children.length) {
            element = element.body.firstChild;
        } else {
            element = element.head.firstChild;
        }
    }

    element = parentElement.ownerDocument.importNode(element, true);

    if (insertBefore) {
        parentElement.insertBefore(element, insertBefore);
    } else {
        parentElement.appendChild(element);
    }

    return element;
}

export default appendXUL;