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
        name: "javascriptrrd.RRDFile",

        setUp: function() {
            this.d = new jarmon.downloadBinary('build/test.rrd')
            .addCallback(
                function(self, binary) {
                    try {
                        return new RRDFile(binary);
                    } catch(e) {
                        console.log(e);
                    }
                }, this)
            .addErrback(
                function(ret) {
                    console.log(ret);
                });
        },

        test_getLastUpdate: function () {
            /**
             * The generated rrd file should have a lastupdate date of
             * 1980-01-01 00:00:10
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var lastUpdate = new Date('1 jan 1980 00:00:10').getTime();
                        Y.Assert.areEqual(
                            lastUpdate/1000, rrd.getLastUpdate());
                    });
                }, this);
            this.wait();
        },

        test_getDSIndex: function () {
            /**
             * The generated rrd file should have a single DS whose name is
             * 'speed'. A RangeError is thrown if the requested index or dsName
             * doesnt exist.
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        Y.Assert.areEqual('speed', rrd.getDS(0).getName());
                        Y.Assert.areEqual(0, rrd.getDS('speed').getIdx());
                        var error = null;
                        try {
                            rrd.getDS(1);
                        } catch(e) {
                            error = e;
                        }
                        Y.assert(error instanceof RangeError);
                    });
                }, this);
            this.wait();
        },

        test_getNrRRAs: function () {
            /**
             * The generated rrd file should have a single RRA
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        Y.Assert.areEqual(1, rrd.getNrRRAs());
                    });
                }, this);
            this.wait();
        },

        test_getRRA: function () {
            /**
             * The generated rrd file should have a single RRA using AVERAGE
             * consolidation, step=1, rows=10 and values 0-9
             * rra.getEl throws a RangeError if asked for row which doesn't
             * exist.
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rra = rrd.getRRA(0);
                        Y.Assert.areEqual('AVERAGE', rra.getCFName());
                        Y.Assert.areEqual(1, rra.getStep());
                        Y.Assert.areEqual(10, rra.getNrRows());
                        for(var i=0; i<10; i++) {
                            Y.Assert.areEqual(i, rra.getEl(i, 0));
                        }
                        var error = null
                        try {
                            rra.getEl(10, 0);
                        } catch(e) {
                            error = e;
                        }
                        Y.assert(error instanceof RangeError);
                    });
                }, this);
            this.wait();
        },



    }));

    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdQuery",

        setUp: function() {
            this.d = new jarmon.downloadBinary('build/test.rrd')
            .addCallback(
                function(self, binary) {
                    try {
                        return new RRDFile(binary);
                    } catch(e) {
                        console.log(e);
                    }
                }, this)
            .addErrback(
                function(ret) {
                    console.log(ret);
                });
        },

        test_getDataTimeRangeOverlapError: function () {
            /**
             * The starttime must be less than the endtime
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rq = new jarmon.RrdQuery(self.rrd, '');
                        var error = null;
                        try {
                            rq.getData(1, 0);
                        } catch(e) {
                            error = e;
                        }
                        Y.Assert.isInstanceOf(jarmon.TimeRangeError, error);
                    });
                }, this);
            this.wait();
        },

        test_getDataSimple: function () {
            /**
             * The generated rrd file should have values 0-9 at 1s intervals
             * starting at 1980-01-01 00:00:00
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rra = rrd.getRRA(0)
                        console.log(rra.getEl(0, 0));


                        var firstUpdate = new Date('1 jan 1980 00:00:00').getTime();
                        var lastUpdate = firstUpdate + 10*1000;
                        Y.Assert.areEqual(
                            lastUpdate/1000, rrd.getLastUpdate());


                        /*
                        var q = new jarmon.RrdQuery(rrd, '');
                        var data = q.getData(firstUpdate, lastUpdate);
                        Y.Assert.areEqual(
                            firstUpdate+1000, data.data[0][0]);
                        */
                    });
                }, this);
            this.wait();
        },

    }));



    //initialize the console
    var yconsole = new Y.Console({
        newestOnTop: false,
        width:'600px',
        height: '400px'
    });
    yconsole.render('#log');

    //run all tests
    Y.Test.Runner.run();
});
