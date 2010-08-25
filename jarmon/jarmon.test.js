/* Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
 * See LICENSE for details.
 *
 * Unit tests for Jarmon
 **/

YUI({ logInclude: { TestRunner: true } }).use('console', 'test', function(Y) {
    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.downloadBinary",

        test_urlNotFound: function () {
            /**
             * When url cannot be found, the deferred should errback with status
             * 404.
             **/
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

        test_urlFound: function () {
            /**
             * When url is found, the deferred should callback with an instance
             * of javascriptrrd.BinaryFile
             **/
            var d = new jarmon.downloadBinary('testfile.bin');
            d.addBoth(
                function(self, ret) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(BinaryFile, ret);
                        Y.Assert.areEqual(String.fromCharCode(0), ret.getRawData());
                    });
                }, this);

            this.wait();
        }

    }));


    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdQuery",

        test_getDataTimeRangeOverlapError: function () {
            /**
             * The starttime must be less than the endtime
             **/
            var rq = new jarmon.RrdQuery({}, '');
            var error = null;
            try {
                rq.getData(1, 0);
            } catch(e) {
                error = e;
            }
            Y.Assert.isInstanceOf(jarmon.TimeRangeError, error);
        }

    }));



    //initialize the console
    var yconsole = new Y.Console({
        newestOnTop: false,
        width:'600px'
    });
    yconsole.render('#log');

    //run all tests
    Y.Test.Runner.run();
});
