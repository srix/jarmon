/* Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
 * See LICENSE for details.
 *
 * Some example recipes for Collectd RRD data - you *will* need to modify this
 * based on the RRD data available on your system.
 */

if(typeof jarmon == 'undefined') {
    var jarmon = {};
}

jarmon.COLLECTD_RECIPES = {
    'cpu': [
        {
            title: 'CPU Usage',
            data: [
                ['cpu-0/cpu-wait.rrd', 0, 'CPU-0 Wait', '%'],
                ['cpu-1/cpu-wait.rrd', 0, 'CPU-1 Wait', '%'],
                ['cpu-0/cpu-system.rrd', 0, 'CPU-0 System', '%'],
                ['cpu-1/cpu-system.rrd', 0, 'CPU-1 System', '%'],
                ['cpu-0/cpu-user.rrd', 0, 'CPU-0 User', '%'],
                ['cpu-1/cpu-user.rrd', 0, 'CPU-1 User', '%']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS,
                                             jarmon.Chart.STACKED_OPTIONS)
        },
    ],

    'memory': [
        {
            title: 'Memory',
            data: [
                ['memory/memory-buffered.rrd', 0, 'Buffered', 'B'],
                ['memory/memory-used.rrd', 0, 'Used', 'B'],
                ['memory/memory-cached.rrd', 0, 'Cached', 'B'],
                ['memory/memory-free.rrd', 0, 'Free', 'B']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS,
                                             jarmon.Chart.STACKED_OPTIONS)
        }
    ],

    'dns': [
        {
            title: 'DNS Query Types',
            data: [
                ['dns/dns_qtype-A.rrd', 0, 'A', 'Q/s'],
                ['dns/dns_qtype-PTR.rrd', 0, 'PTR', 'Q/s'],
                ['dns/dns_qtype-SOA.rrd', 0, 'SOA', 'Q/s'],
                ['dns/dns_qtype-SRV.rrd', 0, 'SRV', 'Q/s']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
        },

        {
            title: 'DNS Return Codes',
            data: [
                ['dns/dns_rcode-NOERROR.rrd', 0, 'NOERROR', 'Q/s'],
                ['dns/dns_rcode-NXDOMAIN.rrd', 0, 'NXDOMAIN', 'Q/s'],
                ['dns/dns_rcode-SERVFAIL.rrd', 0, 'SERVFAIL', 'Q/s']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
        }
    ],

    'load': [
        {
            title: 'Load Average',
            data: [
                ['load/load.rrd', 'shortterm', 'Short Term', ''],
                ['load/load.rrd', 'midterm', 'Medium Term', ''],
                ['load/load.rrd', 'longterm', 'Long Term', '']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
        }
    ],

    'interface': [
        {
            title: 'Wlan0 Throughput',
            data: [
                ['interface/if_octets-wlan0.rrd', 'tx', 'Transmit', 'b/s'],
                ['interface/if_octets-wlan0.rrd', 'rx', 'Receive', 'b/s']
            ],
            options: jQuery.extend(true, {}, jarmon.Chart.BASE_OPTIONS)
        }
    ]
};
