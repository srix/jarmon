
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

jrrd.RrdQuery.prototype.getData = function(startTime, endTime) {
    var startTimestamp = startTime.getTime()/1000;
    var endTimestamp = endTime.getTime()/1000;

    var consolidationFunc = 'AVERAGE';
    var lastUpdated = this.rrd.getLastUpdate();

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

    startRow = rraRowCount - parseInt((lastUpdated - startTimestamp)/step);
    endRow = rraRowCount - parseInt((lastUpdated - endTimestamp)/step);
    returnData = [];
    for(var d=this.rrd.getNrDSs()-1; d>=0; d--) {
        flotData = [];
        timestamp = firstUpdated + (startRow - 1) * step;
        for (var i=startRow; i<=endRow; i++) {
            var val = bestRRA.getEl(i, d);
            flotData.push([timestamp*1000.0, val]);
            timestamp += step;
        }
        returnData.push({label: this.rrd.getDS(d).getName(), data: flotData});
    }
    return returnData;
};


jrrd.RrdQueryRemote = function(url) {
    this.url = url;
    this.rrd = null;
};

jrrd.RrdQueryRemote.prototype.getData = function(startTime, endTime) {
    var endTimestamp = endTime.getTime()/1000;

    var d, self = this;
    if(!this.rrd || this.rrd.getLastUpdate() < endTimestamp) {
        d = jrrd.downloadBinary(this.url)
                .addCallback(
                    function(binary) {
                        var rrd = new RRDFile(binary);
                        self.rrd = rrd;
                        return rrd;
                    });
    } else {
        d = new MochiKit.Async.Deferred()
        d.callback(this.rrd);
    }

    d.addCallback(
        function(rrd) {
            return new jrrd.RrdQuery(rrd).getData(startTime, endTime);
        });

    return d;
};
