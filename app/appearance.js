"use strict";
// UI skins were withdrawn. Keep every other setting untouched.
function migrate(config) { return { uiSkin: "classic" }; }
module.exports = { migrate };
