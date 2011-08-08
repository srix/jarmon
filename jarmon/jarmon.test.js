/* Copyright (c) Richard Wall
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
            var self = this;
            var d = new jarmon.downloadBinary('non-existent-file.html');
            d.always(
                function(ret) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(Error, ret);
                        Y.Assert.areEqual('error:404', ret.message);
                    });
                });

            this.wait();
        },

        test_urlFound: function () {
            /**
             * When url is found, the deferred should callback with an instance
             * of javascriptrrd.BinaryFile
             **/
            var self = this;
            var d = new jarmon.downloadBinary('testfile.bin');
            d.always(
                function(ret) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(jarmon.BinaryFile, ret);
                        Y.Assert.areEqual(
                            String.fromCharCode(0), ret.getCharAt(0));
                    });
                });

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
        name: "jarmon.RRDFile",

        setUp: function() {
            var self = this;
            this.d = new jarmon.downloadBinary('build/test.rrd').pipe(
                function(binary) {
                    return new RRDFile(binary);
                },
                function(ret) {
                    console.log(ret);
                });
        },

        test_getLastUpdate: function () {
            /**
             * The generated rrd file should have a lastupdate date of
             * 1980-01-01 00:50:01
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(function() {
                        Y.Assert.areEqual(
                            RRD_ENDTIME/1000+1, rrd.getLastUpdate());
                    });
                });
            this.wait();
        },

        test_getDSIndex: function () {
            /**
             * The generated rrd file should have a single DS whose name is
             * 'speed'. A RangeError is thrown if the requested index or dsName
             * doesnt exist.
             **/
            var self = this;
            this.d.done(
                function(rrd) {
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
                });
            this.wait();
        },

        test_getNrRRAs: function () {
            /**
             * The generated rrd file should have a single RRA
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(function() {
                        Y.Assert.areEqual(RRD_RRACOUNT, rrd.getNrRRAs());
                    });
                });
            this.wait();
        },

        test_getRRA: function () {
            /**
             * The generated rrd file should have a single RRA using AVERAGE
             * consolidation, step=10, rows=6 and values 0-5
             * rra.getEl throws a RangeError if asked for row which doesn't
             * exist.
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(function() {
                        var rra = rrd.getRRA(0);
                        Y.Assert.areEqual('AVERAGE', rra.getCFName());
                        Y.Assert.areEqual(RRD_STEP, rra.getStep());
                        Y.Assert.areEqual(RRD_RRAROWS, rra.getNrRows());
                        for(var i=0; i<RRD_RRAROWS; i++) {
                            Y.Assert.areEqual(i, rra.getEl(i, RRD_DSINDEX));
                        }
                        var error = null;
                        try {
                            rra.getEl(RRD_RRAROWS+1, 0);
                        } catch(e) {
                            error = e;
                        }
                        Y.assert(error instanceof RangeError);
                    });
                });
            this.wait();
        }
    }));

    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdQuery",

        setUp: function() {
            this.d = new jarmon.downloadBinary('build/test.rrd').pipe(
                function(binary) {
                    return new RRDFile(binary);
                },
                function(ret) {
                    console.log(ret);
                });
        },

        test_getDataTimeRangeOverlapError: function () {
            /**
             * The starttime must be less than the endtime
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(
                        function() {
                            var rq = new jarmon.RrdQuery(rrd, '');
                            var error;
                            try {
                                rq.getData(1, 0);
                            } catch(e) {
                                error = e;
                            }
                            Y.Assert.isInstanceOf(RangeError, error);
                        });
                });
            this.wait();
        },


        test_getDataUnknownCfError: function () {
            /**
             * Error is raised if the rrd file doesn't contain an RRA with the
             * requested consolidation function (CF)
             **/
            var self = this;
            this.d.done(
                function(rrd) {
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
                });
            this.wait();
        },


        test_getData: function () {
            /**
             * The generated rrd file should have values 0-9 at 300s intervals
             * starting at 1980-01-01 00:00:00
             * Result should include a data points with times > starttime and
             * <= endTime
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(function() {
                        var rq = new jarmon.RrdQuery(rrd, '');

                        /* We request data starting 1 STEP +1s after
                        the RRD file first val and ending 1 STEP -1s
                        before the RRD last val ie one step within the
                        RRD file, but 1s away from the step boundary
                        to test the quantisation of the requested time
                        range.*/
                        var data = rq.getData(
                            RRD_STARTTIME + (RRD_STEP+1) * 1000,
                            RRD_ENDTIME - (RRD_STEP-1) * 1000);

                        // so we expect two less rows than the total rows in the
                        // file.
                        Y.Assert.areEqual(RRD_RRAROWS-2, data.data.length);

                        // The value of the first returned row should be the
                        // second value in the RRD file (starts at value 0)
                        Y.Assert.areEqual(1, data.data[0][1]);

                        // The value of the last returned row should be the
                        // 10 value in the RRD file (starts at value 0)
                        Y.Assert.areEqual(10, data.data[data.data.length-1][1]);

                        // The timestamp of the first returned row should be
                        // exactly one step after the start of the RRD file
                        Y.Assert.areEqual(
                            RRD_STARTTIME+RRD_STEP*1000, data.data[0][0]);

                        // RRD_ENDTIME is on a step boundary and is therfore
                        // actually the start time of a new row
                        // So when we ask for endTime = RRD_ENDTIME-STEP-1 we
                        // actually get data up to the 2nd to last RRD row.
                        Y.Assert.areEqual(
                            RRD_ENDTIME-RRD_STEP*1000*2,
                            data.data[data.data.length-1][0]);
                    });
                });
            this.wait();
        },

        test_getDataUnknownValues: function () {
            /**
             * If the requested time range is outside the range of the RRD file
             * we should not get any values back
             **/
            var self = this;
            this.d.done(
                function(rrd) {
                    self.resume(function() {
                        var rq = new jarmon.RrdQuery(rrd, '');
                        var data = rq.getData(RRD_ENDTIME, RRD_ENDTIME+1000);
                        Y.Assert.areEqual(0, data.data.length);
                    });
                });
            this.wait();
        }

    }));


    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdQueryRemote",

        setUp: function() {
            this.rq = new jarmon.RrdQueryRemote('build/test.rrd', '');
        },

        test_getDataTimeRangeOverlapError: function () {
            /**
             * The starttime must be less than the endtime
             **/
            var self = this;
            this.rq.getData(1, 0).fail(
                function(res) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(RangeError, res);
                    });
                });
            this.wait();
        },


        test_getDataUnknownCfError: function () {
            /**
             * Error is raised if the rrd file doesn't contain an RRA with the
             * requested consolidation function (CF)
             **/
            var self = this;
            this.rq.getData(RRD_STARTTIME, RRD_ENDTIME, 0, 'FOO').always(
                function(res) {
                    self.resume(function() {
                        Y.Assert.isInstanceOf(TypeError, res);
                    });
                });
            this.wait();
        },


        test_getData: function () {
            /**
             * The generated rrd file should have values 0-9 at 300s intervals
             * starting at 1980-01-01 00:00:00
             * Result should include a data points with times > starttime and
             * <= endTime
             **/
            var self = this;
            this.rq.getData(RRD_STARTTIME + (RRD_STEP+1) * 1000,
                            RRD_ENDTIME - (RRD_STEP-1) * 1000).always(
                function(data) {
                    self.resume(function() {
                        /* We request data starting 1 STEP +1s after
                         the RRD file first val and ending 1 STEP -1s
                         before the RRD last val ie one step within
                         the RRD file, but 1s away from the step
                         boundary to test the quantisation of the
                         requested time range.
                         so we expect two less rows than the total
                         rows in the file. */
                        Y.Assert.areEqual(RRD_RRAROWS-2, data.data.length);

                        // The value of the first returned row should be the
                        // second value in the RRD file (starts at value 0)
                        Y.Assert.areEqual(1, data.data[0][1]);

                        // The value of the last returned row should be the
                        // 10 value in the RRD file (starts at value 0)
                        Y.Assert.areEqual(10, data.data[data.data.length-1][1]);

                        // The timestamp of the first returned row should be
                        // exactly one step after the start of the RRD file
                        Y.Assert.areEqual(
                            RRD_STARTTIME+RRD_STEP*1000, data.data[0][0]);

                        // RRD_ENDTIME is on a step boundary and is therfore
                        // actually the start time of a new row
                        // So when we ask for endTime = RRD_ENDTIME-STEP-1 we
                        // actually get data up to the 2nd to last RRD row.
                        Y.Assert.areEqual(
                            RRD_ENDTIME-RRD_STEP*1000*2,
                            data.data[data.data.length-1][0]);
                    });
                });
            this.wait();
        },

        test_getDataUnknownValues: function () {
            /**
             * If the requested time range is outside the range of the RRD file
             * we should not get any values back
             **/
            var self = this;
            this.rq.getData(RRD_ENDTIME, RRD_ENDTIME+1000).always(
                function(data) {
                    self.resume(function() {
                        Y.Assert.areEqual(0, data.data.length);
                    });
                });
            this.wait();
        }
    }));


    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.Chart",

        test_draw: function () {
            /**
             * Test that a rendered chart has the correct dimensions, legend,
             * axis, labels etc
             **/
            var self = this;
            var $tpl = $(
                '<div><div class="chart"></div></div>').appendTo($('body'));
            var c = new jarmon.Chart($tpl, jarmon.Chart.BASE_OPTIONS);
            //
            c.options.xaxis.tzoffset = 0;
            c.addData(
                'speed',
                new jarmon.RrdQueryRemote('build/test.rrd', 'm/s'),
                true);
            var d = c.setTimeRange(RRD_STARTTIME, RRD_ENDTIME);
            d.done(
                function() {
                    self.resume(function() {
                        // TODO: write useful tests
                    });
                });
            this.wait();
        }
    }));


    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.RrdChooser",

        setUp: function() {
            this.$tpl = $('<div/>').appendTo($('body'));
            var c = new jarmon.RrdChooser(this.$tpl);
            c.drawRrdUrlForm();
        },

        test_drawInitialForm: function () {
            /**
             * Test that the initial config form contains an rrd form field
             **/
            Y.Assert.areEqual(
                this.$tpl.find('form input[name=rrd_url]').size(), 1);
        },

        test_drawUrlErrorMessage: function () {
            /**
             * Test that submitting the form with an incorrect url results in
             * an error message
             **/
            var self = this;
            this.$tpl.find('form input[name=rrd_url]').val('Foo/Bar').submit();
            this.wait(
                function() {
                    Y.Assert.areEqual(self.$tpl.find('.error').size(), 1);
                }, 1000);
        },

        test_drawUrlListDatasources: function () {
            /**
             * Test that submitting the form with an correct rrd url results in
             * list of further DS  label fields
             **/
            var self = this;
            this.$tpl.find(
                'form input[name=rrd_url]').val('build/test.rrd').submit();
            this.wait(
                function() {
                    Y.Assert.areEqual(
                        self.$tpl.find('input[name=rrd_ds_label]').size(), 1);
                }, 1000
            );
        }
    }));


    Y.Test.Runner.add(new Y.Test.Case({
        name: "jarmon.ChartEditor",

        setUp: function() {
            this.$tpl = $('<div/>').appendTo($('body'));
            var c = new jarmon.ChartEditor(
                this.$tpl,
                {
                    title: 'Foo',
                    datasources: [
                        ['data/cpu-0/cpu-wait.rrd', 0, 'CPU-0 Wait', '%'],
                        ['data/cpu-1/cpu-wait.rrd', 0, 'CPU-1 Wait', '%'],
                        ['data/cpu-0/cpu-system.rrd', 0, 'CPU-0 System', '%'],
                        ['data/cpu-1/cpu-system.rrd', 0, 'CPU-1 System', '%'],
                        ['data/cpu-0/cpu-user.rrd', 0, 'CPU-0 User', '%'],
                        ['data/cpu-1/cpu-user.rrd', 0, 'CPU-1 User', '%']
                    ]
                }
            );
            c.draw();
        },

        test_drawInitialForm: function () {
            /**
             * Test that the initial config form contains an rrd form field
             **/
            Y.Assert.areEqual(
                this.$tpl.find('form input[name=rrd_url]').size(), 1);
        }
    }));


    //initialize the console
    var yconsole = new Y.Console({
        newestOnTop: false,
        width:'600px',
        height: '400px'
    });
    yconsole.render('#log');
    Y.Test.Runner.run();
});
