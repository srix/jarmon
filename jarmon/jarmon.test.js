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

    var RRD_STEP = 10;
    var RRD_DSNAME = 'speed';
    var RRD_DSINDEX = 0;
    var RRD_RRACOUNT = 2;
    var RRD_RRAROWS = 12;
    var RRD_STARTTIME = new Date('1 jan 1980 00:00:00').getTime();
    var RRD_ENDTIME = new Date('1 jan 1980 00:02:00').getTime();

    Y.Test.Runner.add(new Y.Test.Case({
        name: "javascriptrrd.RRDFile",

        setUp: function() {
            this.d = new jarmon.downloadBinary('build/test.rrd')
            .addCallback(
                function(self, binary) {
                    return new RRDFile(binary);
                }, this)
            .addErrback(
                function(ret) {
                    console.log(ret);
                });
        },

        test_getLastUpdate: function () {
            /**
             * The generated rrd file should have a lastupdate date of
             * 1980-01-01 00:50:01
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        Y.Assert.areEqual(
                            RRD_ENDTIME/1000+1, rrd.getLastUpdate());
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
                        Y.Assert.areEqual(RRD_DSNAME, rrd.getDS(0).getName());
                        Y.Assert.areEqual(
                            RRD_DSINDEX, rrd.getDS('speed').getIdx());
                        var error = null;
                        try {
                            rrd.getDS(RRD_DSINDEX+1);
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
                        Y.Assert.areEqual(RRD_RRACOUNT, rrd.getNrRRAs());
                    });
                }, this);
            this.wait();
        },

        test_getRRA: function () {
            /**
             * The generated rrd file should have a single RRA using AVERAGE
             * consolidation, step=10, rows=6 and values 0-5
             * rra.getEl throws a RangeError if asked for row which doesn't
             * exist.
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rra = rrd.getRRA(0);
                        Y.Assert.areEqual('AVERAGE', rra.getCFName());
                        Y.Assert.areEqual(RRD_STEP, rra.getStep());
                        Y.Assert.areEqual(RRD_RRAROWS, rra.getNrRows());
                        for(var i=0; i<RRD_RRAROWS; i++) {
                            Y.Assert.areEqual(i, rra.getEl(i, RRD_DSINDEX));
                        }
                        var error = null
                        try {
                            rra.getEl(RRD_RRAROWS+1, 0);
                        } catch(e) {
                            error = e;
                        }
                        Y.assert(error instanceof RangeError);
                    });
                }, this);
            this.wait();
        }
    }));

    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdQuery",

        setUp: function() {
            this.d = new jarmon.downloadBinary('build/test.rrd')
            .addCallback(
                function(self, binary) {
                    return new RRDFile(binary);
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
                        var rq = new jarmon.RrdQuery(rrd, '');
                        var error = null;
                        try {
                            rq.getData(1, 0);
                        } catch(e) {
                            error = e;
                        }
                        Y.Assert.isInstanceOf(RangeError, error);
                    });
                }, this);
            this.wait();
        },


        test_getDataUnknownCfError: function () {
            /**
             * Error is raised if the rrd file doesn't contain an RRA with the
             * requested consolidation function (CF)
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rq = new jarmon.RrdQuery(rrd, '');
                        var error = null;
                        try {
                            rq.getData(RRD_STARTTIME, RRD_ENDTIME, 0, 'FOO');
                        } catch(e) {
                            error = e;
                        }
                        Y.Assert.isInstanceOf(TypeError, error);
                    });
                }, this);
            this.wait();
        },


        test_getData: function () {
            /**
             * The generated rrd file should have values 0-9 at 300s intervals
             * starting at 1980-01-01 00:00:00
             * Result should include a data points with times > starttime and
             * <= endTime
             **/
            this.d.addCallback(
                function(self, rrd) {
                    self.resume(function() {
                        var rq = new jarmon.RrdQuery(rrd, '');
                        var data = rq.getData(RRD_STARTTIME, RRD_ENDTIME);
                        Y.Assert.areEqual(RRD_RRAROWS+1, data.data.length);
                        Y.Assert.areEqual(2, data.data[2][1]);
                        Y.Assert.areEqual(
                            RRD_STARTTIME+RRD_STEP*1000, data.data[0][0]);
                        Y.Assert.areEqual(
                            RRD_ENDTIME + RRD_STEP*1000,
                            data.data[data.data.length-1][0]);
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
