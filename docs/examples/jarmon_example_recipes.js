/* Copyright (c) Richard Wall
 * See LICENSE for details.
 *
 * Some example recipes for Collectd RRD data - you *will* need to modify this
 * based on the RRD data available on your system.
 */

if(typeof jarmon == 'undefined') {
    var jarmon = {};
}

jarmon.TAB_RECIPES_STANDARD = [
    ['System',      ['cpu', 'memory','load']],
    ['Network',     ['interface']],
    ['DNS',         ['dns_query_types', 'dns_return_codes']]
];

jarmon.CHART_RECIPES_COLLECTD = {
    'cpu': {
        title: 'CPU Usage',
        data: [
            ['data/cpu-0/cpu-wait.rrd', 0, 'CPU-0 Wait', '%'],
            ['data/cpu-1/cpu-wait.rrd', 0, 'CPU-1 Wait', '%'],
            ['data/cpu-0/cpu-system.rrd', 0, 'CPU-0 System', '%'],
            ['data/cpu-1/cpu-system.rrd', 0, 'CPU-1 System', '%'],
            ['data/cpu-0/cpu-user.rrd', 0, 'CPU-0 User', '%'],
            ['data/cpu-1/cpu-user.rrd', 0, 'CPU-1 User', '%']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS,
                                         jarmon.Chart.STACKED_OPTIONS)
    },

    'memory': {
        title: 'Memory',
        data: [
            ['data/memory/memory-buffered.rrd', 0, 'Buffered', 'B'],
            ['data/memory/memory-used.rrd', 0, 'Used', 'B'],
            ['data/memory/memory-cached.rrd', 0, 'Cached', 'B'],
            ['data/memory/memory-free.rrd', 0, 'Free', 'B']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS,
                                         jarmon.Chart.STACKED_OPTIONS)
    },

    'dns_query_types': {
        title: 'DNS Query Types',
        data: [
            ['data/dns/dns_qtype-A.rrd', 0, 'A', 'Q/s'],
            ['data/dns/dns_qtype-PTR.rrd', 0, 'PTR', 'Q/s'],
            ['data/dns/dns_qtype-SOA.rrd', 0, 'SOA', 'Q/s'],
            ['data/dns/dns_qtype-SRV.rrd', 0, 'SRV', 'Q/s']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
    },

    'dns_return_codes': {
        title: 'DNS Return Codes',
        data: [
            ['data/dns/dns_rcode-NOERROR.rrd', 0, 'NOERROR', 'Q/s'],
            ['data/dns/dns_rcode-NXDOMAIN.rrd', 0, 'NXDOMAIN', 'Q/s'],
            ['data/dns/dns_rcode-SERVFAIL.rrd', 0, 'SERVFAIL', 'Q/s']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
    },

    'load': {
        title: 'Load Average',
        data: [
            ['data/load/load.rrd', 'shortterm', 'Short Term', ''],
            ['data/load/load.rrd', 'midterm', 'Medium Term', ''],
            ['data/load/load.rrd', 'longterm', 'Long Term', '']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
    },

    'interface': {
        title: 'Wlan0 Throughput',
        data: [
            ['data/interface/if_octets-wlan0.rrd', 'tx', 'Transmit', 'b/s'],
            ['data/interface/if_octets-wlan0.rrd', 'rx', 'Receive', 'b/s']
        ],
        options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
    }
};
