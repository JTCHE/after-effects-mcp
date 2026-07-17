// JSON polyfill for ExtendScript (when JSON is undefined)
if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        // Safe-ish fallback for trusted input (our own command file)
        return eval("(" + text + ")");
    };
}
if (typeof JSON.stringify !== "function") {
    (function () {
        function esc(str) {
            return (str + "")
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t")
                // Any other control char (U+0000-U+001F) is invalid unescaped in JSON;
                // an unescaped one here silently produces bad JSON that Node's parser
                // rejects, which the poll loop misreads as "not ready yet" and times out.
                .replace(new RegExp("[\x00-\x1f]", "g"), function (c) {
                    var code = c.charCodeAt(0).toString(16);
                    while (code.length < 4) code = "0" + code;
                    return "\\u" + code;
                });
        }
        function toJSON(val) {
            if (val === null) return "null";
            var t = typeof val;
            // NaN/Infinity have no JSON representation; emitting their literal names
            // produces invalid JSON that fails to parse on the Node side (same
            // false-timeout failure mode as the control-char case above).
            if (t === "number") return isFinite(val) ? String(val) : "null";
            if (t === "boolean") return String(val);
            if (t === "string") return '"' + esc(val) + '"';
            if (val instanceof Array) {
                var a = [];
                for (var i = 0; i < val.length; i++) a.push(toJSON(val[i]));
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var props = [];
                for (var k in val) {
                    if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
                        props.push('"' + esc(k) + '":' + toJSON(val[k]));
                    }
                }
                return "{" + props.join(",") + "}";
            }
            return "null";
        }
        JSON.stringify = function (value, _replacer, _space) {
            return toJSON(value);
        };
    })();
}
