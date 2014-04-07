var assert = require('assert');

var utils = require('./utils');

function eq(a, b, name) {
    var expected = JSON.stringify(a);
    var actual = JSON.stringify(b);
    assert.deepEqual(a, b, name + ": Expected " + expected + ", but got " + actual);
}

(function test_parseArgs() {
    var args;
    var actual;
    var expected;

    // No-op
    args = ["hello", "world"];
    expected = args;
    actual = utils.parseArgs(args);
    eq(expected, actual, "noop")t diff
    ;

    // Basic quotes - single
    args = ["one", "'two", "which", "is", "quoted'", "three"];
    expected = ["one", "two which is quoted", "three"];
    actual = utils.parseArgs(args);
    eq(expected, actual, "basic quotes single");

    // Basic quotes - double
    args = ["one", '"two', "which", "is", 'quoted"', "three"];
    expected = ["one", "two which is quoted", "three"];
    actual = utils.parseArgs(args);
    eq(expected, actual, "basic quotes double");

    // One word quoted
    args = ["one", "'two'", "three"];
    expected = ["one", "two", "three"];
    actual = utils.parseArgs(args);
    eq(expected, actual, "one word quoted");

    // mixed quotes
    args = ["one", "'two", '("2")', "tricky'", "three"];
    expected = ["one", 'two ("2") tricky', "three"];
    actual = utils.parseArgs(args);
    eq(expected, actual, "nested quotes");

    // Bare apostrophe
    args = ["name", "O'Dell", "more"];
    expected = ["name", "O'Dell", "more"];
    actual = utils.parseArgs(args);
    eq(expected, actual, "Bare apostrophe");
})();


(function test_escapeUnicode() {
    var actual;
    var expected;
    var obj;

    obj = {foo: 'bar'};
    actual = utils.jsonStringifyUnicode(obj);
    expected = JSON.stringify(obj);
    eq(expected, actual, "Basic JSON");

    actual = utils.jsonStringifyUnicode('I like π', true);
    expected = '"I like π"';
    eq(expected, actual, "Unicode mode");

    actual = utils.jsonStringifyUnicode('I like π', false);
    expected = '"I like \\u03c0"';
    eq(expected, actual, "Escape mode");

    actual = utils.jsonStringifyUnicode('I like π');
    expected = '"I like \\u03c0"';
    eq(expected, actual, "Default mode");
})();
