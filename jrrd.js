
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


jrrd.RrdQuery = function(rrd) {
    this.rrd = rrd;
};

jrrd.RrdQuery.prototype.getData = function(startTime, endTime, dsId) {
    var startTimestamp = startTime.getTime()/1000;
    var endTimestamp = endTime.getTime()/1000;

    if(dsId == null) {
        dsId = 0;
    }
    var ds = this.rrd.getDS(dsId);
    var consolidationFunc = 'AVERAGE';
    var lastUpdated = this.rrd.getLastUpdate();

    // If end time stamp is beyond the range of this rrd then reset it
    if(lastUpdated < endTimestamp) {
        endTimestamp = lastUpdated;
    }
    var bestRRA = null;
    for(var i=0; i<this.rrd.getNrRRAs(); i++) {
        // Look through all RRAs looking for the most suitable
        // data resolution.
        var rra = this.rrd.getRRA(i);

        if(rra.getCFName() != consolidationFunc) {
            continue;
        }
        bestRRA = rra;
        var step = rra.getStep();
        var rraRowCount = rra.getNrRows();
        var firstUpdated = lastUpdated - (rraRowCount - 1) * step;
        if(firstUpdated <= startTimestamp) {
            break;
        }
    }

    if(!bestRRA) {
        throw new Error('Unrecognised consolidation function: ' + consolidationFunc);
    }

    var startRow = rraRowCount - parseInt((lastUpdated - startTimestamp)/step) - 1;
    var endRow = rraRowCount - parseInt((lastUpdated - endTimestamp)/step) - 1;

    var flotData = [];
    var timestamp = firstUpdated + (startRow - 1) * step;
    var dsIndex = ds.getIdx();
    for (var i=startRow; i<=endRow; i++) {
        var val = bestRRA.getEl(i, dsIndex);
        flotData.push([timestamp*1000.0, val]);
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
