/* Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
 * See LICENSE for details.
 *
 * Wrappers and convenience fuctions for working with the javascriptRRD, jQuery,
 * and flot charting packages.
 *
 * javascriptRRD - http://javascriptrrd.sourceforge.net/
 * jQuery - http://jquery.com/
 * flot - http://code.google.com/p/flot/
 */

if(typeof jrrd == 'undefined') {
    var jrrd = {};
}

jrrd.downloadBinary = function(url) {
    var d = new MochiKit.Async.Deferred();

    $.ajax({
        url: url,
        dataType: 'text',
        cache: false,
        beforeSend: function(request) {
            try {
                request.overrideMimeType('text/plain; charset=x-user-defined');
            } catch(e) {
                // IE doesn't support overrideMimeType
            }
        },
        success: function(data) {
            try {
                d.callback(new BinaryFile(data));
            } catch(e) {
                d.errback(e);
            }
        },
        error: function(xhr, textStatus, errorThrown) {
            // Special case for IE which handles binary data slightly
            // differently.
            if(textStatus == 'parsererror') {
                if (typeof xhr.responseBody != 'undefined') {
                    return this.success(xhr.responseBody);
                }
            }
            d.errback(new Error(xhr.status));
        }
    });
    return d;
};

/**
 * A wrapper around an instance of javascriptrrd.RRDFile which provides a
 * convenient way to query the RRDFile based on time range, RRD data source (DS)
 * and RRD consolidation function (CF).
 *
 * @param startTime: A javascript {Date} instance representing the start of query
 *                   time range, or {null} to return earliest available data.
 * @param endTime: A javascript {Date} instance representing the end of query
 *                   time range, or {null} to return latest available data.
 * @param dsId: A {String} name of an RRD DS or an {Int} DS index number or
 *              {null} to return the first available DS.
 * @param cfName: A {String} name of an RRD consolidation function
 * @return: A flot compatible data series object
 **/
jrrd.RrdQuery = function(rrd) {
    this.rrd = rrd;
};

jrrd.RrdQuery.prototype.getData = function(startTime, endTime, dsId, cfName) {
    var startTimestamp = startTime.getTime()/1000;

    var lastUpdated = this.rrd.getLastUpdate();
    var endTimestamp = lastUpdated;
    if(endTime) {
        endTimestamp = endTime.getTime()/1000;
        // If end time stamp is beyond the range of this rrd then reset it
        if(lastUpdated < endTimestamp) {
            endTimestamp = lastUpdated;
        }
    }

    if(dsId == null) {
        dsId = 0;
    }
    var ds = this.rrd.getDS(dsId);

    if(cfName == null) {
        cfName = 'AVERAGE';
    }

    var rra, step, rraRowCount, firstUpdated;
    for(var i=0; i<this.rrd.getNrRRAs(); i++) {
        // Look through all RRAs looking for the most suitable
        // data resolution.
        var rra = this.rrd.getRRA(i);

        // If this rra doesn't use the requested CF then move on to the next.
        if(rra.getCFName() != cfName) {
            continue;
        }

        step = rra.getStep();
        rraRowCount = rra.getNrRows();
        firstUpdated = lastUpdated - (rraRowCount - 1) * step;
        // We assume that the RRAs are listed in ascending order of time range,
        // therefore the first RRA which contains the range minimum should give
        // the highest resolution data for this range.
        if(firstUpdated <= startTimestamp) {
            break;
        }
    }
    // If we got to the end of the loop without ever defining step, it means
    // that the CF check never succeded.
    if(!step) {
        throw new Error('Unrecognised consolidation function: ' + cfName);
    }

    var startRow = rraRowCount - parseInt((lastUpdated - startTimestamp)/step) - 1;
    var endRow = rraRowCount - parseInt((lastUpdated - endTimestamp)/step) - 1;

    var flotData = [];
    var timestamp = firstUpdated + (startRow - 1) * step;
    var dsIndex = ds.getIdx();
    for (var i=startRow; i<=endRow; i++) {
        flotData.push([timestamp*1000.0, rra.getEl(i, dsIndex)]);
        timestamp += step;
    }

    return {label: ds.getName(), data: flotData};
};


jrrd.RrdQueryRemote = function(url) {
    this.url = url;
    this.lastUpdate = 0;
    this._download = null;
};

jrrd.RrdQueryRemote.prototype.getData = function(startTime, endTime, dsId) {
    var endTimestamp = endTime.getTime()/1000;

    // Download the rrd if there has never been a download or if the last
    // completed download had a lastUpdated timestamp less than the requested
    // end time.
    // Don't start another download if one is already in progress.
    if(!this._download || (this._download.fired > -1 && this.lastUpdate < endTimestamp )) {
        this._download = jrrd.downloadBinary(this.url)
                .addCallback(
                    function(self, binary) {
                        // Upon successful download convert the resulting binary
                        // into an RRD file and pass it on to the next callback
                        // in the chain.
                        var rrd = new RRDFile(binary);
                        self.lastUpdate = rrd.getLastUpdate();
                        return rrd;
                    }, this);
    }

    // Set up a deferred which will call getData on the local RrdQuery object
    // returning a flot compatible data object to the caller.
    var ret = new MochiKit.Async.Deferred().addCallback(
        function(startTime, endTime, dsId, rrd) {
            return new jrrd.RrdQuery(rrd).getData(startTime, endTime, dsId);
        }, startTime, endTime, dsId);

    // Add a pair of callbacks to the current download which will callback the
    // result which we setup above.
    this._download.addBoth(
        function(ret, res) {
            if(res instanceof Error) {
                ret.errback(res);
            } else {
                ret.callback(res);
            }
            return res;
        }, ret);

    return ret;
};


jrrd.RrdQueryDsProxy = function(rrdQuery, dsId) {
    this.rrdQuery = rrdQuery;
    this.dsId = dsId;
};

jrrd.RrdQueryDsProxy.prototype.getData = function(startTime, endTime) {
    return this.rrdQuery.getData(startTime, endTime, this.dsId);
};


jrrd.Chart = function(template, options) {
    this.template = template;
    this.options = options;
    this.data = [];
};

jrrd.Chart.prototype.addData = function(label, db) {
    this.data.push([label, db]);
};

jrrd.Chart.prototype.draw = function(startTime, endTime) {
    var results = [];
    for(var i=0; i<this.data.length; i++) {
        results.push(this.data[i][1].getData(startTime, endTime));
    }

    return MochiKit.Async.gatherResults(results)
            .addCallback(
                function(self, data) {
                    for(var i=0; i<data.length; i++) {
                        data[i].label = self.data[i][0];
                    }
                    var plot = $.plot(self.template, data, self.options);
                }, this)
            .addErrback(
                function(self, failure) {
                    self.template.text('error: ' + failure.message);
                }, this);
};
