/* Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
 * See LICENSE for details.
 *
 * Unit tests for Jarmon
 **/

YUI().use('test', function(Y) {
    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.downloadBinary",

        setUp : function () {
        },

        tearDown : function () {
        },

        test_urlNotFound: function () {
            var d = new jarmon.downloadBinary('non-existent-file.html');
            d.addBoth(
                function(self, ret) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(Error, ret);
                        Y.Assert.areEqual(404, ret.message);
                    });
                }, this);

            this.wait();
        },
    }));

    //run all tests
    Y.Test.Runner.run();
});
