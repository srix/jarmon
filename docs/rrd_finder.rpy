import json
import os

from twisted.python.filepath import FilePath
from twisted.web.resource import Resource

RRD_PATH = '/var/lib/collectd/rrd/aziz/'
URL_BASE = 'data'

class RrdFinder(Resource):
    isLeaf = True
    def render_GET(self, request):
        p = FilePath(RRD_PATH)
        paths = []
        for f in p.walk():
            if f.basename().endswith('.rrd'):
                paths.append(os.path.join(URL_BASE, *f.segmentsFrom(p)))
        return json.dumps(paths)

resource = RrdFinder()
