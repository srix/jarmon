# Copyright (c) Richard Wall
# See LICENSE for details.
"""
Functions and Classes for automating the release of Jarmon
"""

import hashlib
import logging
import os
import shutil
import sys
import httplib
import urllib

from datetime import datetime
from optparse import OptionParser
from subprocess import check_call, PIPE
from tempfile import gettempdir
from urllib2 import urlopen
from zipfile import ZipFile, ZIP_DEFLATED

import pkg_resources


JARMON_PROJECT_TITLE = 'Jarmon'
JARMON_PROJECT_URL = 'http://www.launchpad.net/jarmon'

YUIDOC_URL = 'http://yui.zenfs.com/releases/yuidoc/yuidoc_1.0.0b1.zip'
YUIDOC_MD5 = 'cd5545d2dec8f7afe3d18e793538162c'
YUIDOC_DEPENDENCIES = ['setuptools', 'pygments', 'cheetah']


class BuildError(Exception):
    """
    A base Exception for errors in the build system
    """
    pass


class BuildCommand(object):
    def __init__(self):
        self.log = logging.getLogger(
            '%s.%s' % (__name__, self.__class__.__name__))

        self.workingbranch_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..'))

        # setup working dir
        self.build_dir = os.path.join(self.workingbranch_dir, 'build')

        if not os.path.isdir(self.build_dir):
            self.log.debug('Creating build dir: %s' % (self.build_dir,))
            os.mkdir(self.build_dir)
        else:
            self.log.debug('Using build dir: %s' % (self.build_dir,))


class BuildApidocsCommand(BuildCommand):
    """
    Download YUI Doc and use it to generate apidocs for jarmon
    """

    command_name = 'apidocs'

    def main(self, argv):
        """
        The main entry point for the build-apidocs command

        @param argv: The list of arguments passed to the build-apidocs command
        """

        parser = OptionParser(
            usage='build [options] %s VERSION' % (self.command_name,))
        parser.disable_interspersed_args()
        options, args = parser.parse_args(argv)

        if len(args) != 1:
            parser.error('Wrong number of arguments. This command expects a '
                         'version number only.')

        buildversion = args[0]

        tmpdir = gettempdir()
        workingbranch_dir = self.workingbranch_dir
        build_dir = self.build_dir

        # Check for yuidoc dependencies
        for r in pkg_resources.parse_requirements(YUIDOC_DEPENDENCIES):
            if not pkg_resources.working_set.find(r):
                raise BuildError('Unsatisfied yuidoc dependency: %r' % (r,))

        # download and cache yuidoc
        yuizip_path = os.path.join(tmpdir, os.path.basename(YUIDOC_URL))
        if os.path.exists(yuizip_path):
            self.log.debug('Using cached YUI doc')

            def producer_local():
                yield open(yuizip_path).read()

            producer = producer_local
        else:
            self.log.debug('Downloading YUI Doc')

            def producer_remote():
                with open(yuizip_path, 'w') as yuizip:
                    download = urlopen(YUIDOC_URL)
                    while True:
                        bytes = download.read(1024 * 10)
                        if not bytes:
                            break
                        else:
                            yuizip.write(bytes)
                            yield bytes

            producer = producer_remote

        checksum = hashlib.md5()
        for bytes in producer():
            checksum.update(bytes)

        actual_md5 = checksum.hexdigest()
        if actual_md5 != YUIDOC_MD5:
            raise BuildError(
                'YUI Doc checksum error. File: %s, '
                'Expected: %s, '
                'Got: %s' % (yuizip_path, YUIDOC_MD5, actual_md5))
        else:
            self.log.debug('YUI Doc checksum verified')

        # Remove any existing apidocs so that we can track removed files
        shutil.rmtree(os.path.join(build_dir, 'docs', 'apidocs'), True)

        yuidoc_dir = os.path.join(build_dir, 'yuidoc')

        # extract yuidoc folder from the downloaded zip file
        self.log.debug(
            'Extracting YUI Doc from %s to %s' % (yuizip_path, yuidoc_dir))
        zip = ZipFile(yuizip_path)
        zip.extractall(
            build_dir, (m for m in zip.namelist() if m.startswith('yuidoc')))

        # Use the yuidoc script that we just extracted to generate new docs
        self.log.debug('Running YUI Doc')
        check_call((
            sys.executable,
            os.path.join(yuidoc_dir, 'bin', 'yuidoc.py'),
            os.path.join(workingbranch_dir, 'jarmon'),
            '--parseroutdir=%s' % (
                os.path.join(build_dir, 'docs', 'apidocs'),),
            '--outputdir=%s' % (
                os.path.join(build_dir, 'docs', 'apidocs'),),
            '--template=%s' % (
                os.path.join(
                    workingbranch_dir, 'jarmonbuild', 'yuidoc_template'),),
            '--version=%s' % (buildversion,),
            '--project=%s' % (JARMON_PROJECT_TITLE,),
            '--projecturl=%s' % (JARMON_PROJECT_URL,),
        ), stdout=PIPE, stderr=PIPE,)

        shutil.rmtree(yuidoc_dir)


class BuildReleaseCommand(BuildCommand):
    """
    Export all source files, generate apidocs and create a zip archive for
    upload to Launchpad.
    """

    command_name = 'release'

    def main(self, argv):

        parser = OptionParser(
            usage='build [options] %s VERSION' % (self.command_name,))
        parser.disable_interspersed_args()
        options, args = parser.parse_args(argv)

        if len(args) != 1:
            parser.error('Wrong number of arguments. This command expects a '
                         'version number only.')

        buildversion = args[0]

        workingbranch_dir = self.workingbranch_dir
        build_dir = self.build_dir

        self.log.debug('Export versioned files to a build folder')
        from bzrlib.commands import main as bzr_main
        status = bzr_main(['bzr', 'export', build_dir, workingbranch_dir])
        if status != 0:
            raise BuildError('bzr export failure. Status: %r' % (status,))

        self.log.debug('Record the branch version')
        from bzrlib.branch import Branch
        from bzrlib.version_info_formats import format_python
        v = format_python.PythonVersionInfoBuilder(
            Branch.open(workingbranch_dir))

        versionfile_path = os.path.join(
            build_dir, 'jarmonbuild', '_version.py')

        with open(versionfile_path, 'w') as f:
            v.generate(f)

        self.log.debug('Generate apidocs')
        BuildApidocsCommand().main([buildversion])

        self.log.debug('Generate archive')
        archive_root = 'jarmon-%s' % (buildversion,)
        prefix_len = len(build_dir) + 1
        z = ZipFile('%s.zip' % (archive_root,), 'w', ZIP_DEFLATED)
        try:
            for root, dirs, files in os.walk(build_dir):
                for file in files:
                    z.write(
                        os.path.join(root, file),
                        os.path.join(archive_root, root[prefix_len:], file),
                    )
        finally:
            z.close()


class BuildTestDataCommand(BuildCommand):
    """
    Create data for use in unittests
    """

    command_name = 'testdata'

    def main(self, argv):
        """
        Create an RRD file with values 0-9 entered at 1 second intervals from
        1980-01-01 00:00:00 (the first date that rrdtool allows)
        """
        from pyrrd.rrd import DataSource, RRA, RRD
        start = int(datetime(1980, 1, 1, 0, 0).strftime('%s'))
        dss = []
        rras = []
        filename = os.path.join(self.build_dir, 'test.rrd')

        rows = 12
        step = 10

        dss.append(
            DataSource(dsName='speed', dsType='GAUGE', heartbeat=2 * step))
        rras.append(RRA(cf='AVERAGE', xff=0.5, steps=1, rows=rows))
        rras.append(RRA(cf='AVERAGE', xff=0.5, steps=12, rows=rows))
        my_rrd = RRD(filename, ds=dss, rra=rras, start=start, step=step)
        my_rrd.create()

        for i, t in enumerate(
            range(start + step, start + step + (rows * step), step)):
            self.log.debug(
                'DATA: %s %s (%s)' % (t, i, datetime.fromtimestamp(t)))
            my_rrd.bufferValue(t, i)

        # Add further data 1 second later to demonstrate that the rrd
        # lastupdatetime does not necessarily fall on a step boundary
        t += 1
        i += 1
        self.log.debug('DATA: %s %s (%s)' % (t, i, datetime.fromtimestamp(t)))
        my_rrd.bufferValue(t, i)

        my_rrd.update()


class BuildJavascriptDependenciesCommand(BuildCommand):
    """
    Export all source files, generate apidocs and create a zip archive for
    upload to Launchpad.
    """

    command_name = 'jsdeps'

    def main(self, argv):
        self.log.debug('Compiling javascript dependencies')

        depjs_path = os.path.join(
            self.workingbranch_dir,
            'docs/examples/assets/js/dependencies.js')

        # Get the closure params from the original file
        params = []
        for line in  open(depjs_path):
            line = line.strip()
            if line.startswith('// @'):
                key, val = line.lstrip('/ @').strip().split(None, 1)
                params.append((key.strip(), val.strip()))

        # Always use the following value for the Content-type header.
        headers = { "Content-type": "application/x-www-form-urlencoded" }
        conn = httplib.HTTPConnection('closure-compiler.appspot.com')
        conn.request('POST', '/compile', urllib.urlencode(params), headers)
        response = conn.getresponse()
        with open(depjs_path, 'w') as f:
            f.write(
                '// Compiled with closure-compiler on %s\n' % (datetime.now()))
            for param in params:
                f.write('// @%s %s\n' % param)

            while not response.isclosed():
                f.write(response.read(1024 * 10))

        conn.close



# The available subcommands
SUBCOMMAND_HANDLERS = [
    BuildApidocsCommand,
    BuildReleaseCommand,
    BuildTestDataCommand,
    BuildJavascriptDependenciesCommand,
]


def main(argv=sys.argv[1:]):
    """
    The root build command which dispatches to various subcommands for eg
    building apidocs and release zip files.
    """

    build_commands = dict(
        (handler.command_name, handler) for handler in SUBCOMMAND_HANDLERS)

    parser = OptionParser(
        usage='build [options] SUBCOMMAND [options]',
        description='Available subcommands are: %r' % (build_commands.keys(),))
    parser.add_option(
        '-d', '--debug', action='store_true', default=False, dest='debug',
        help='Print verbose debug log to stderr')

    parser.disable_interspersed_args()

    options, args = parser.parse_args(argv)

    if len(args) < 1:
        parser.error('Please specify a sub command. '
                     'Available commands: %r' % (build_commands.keys()))

    # First argument is the name of a subcommand
    command_name = args.pop(0)
    command_factory = build_commands.get(command_name)
    if not command_factory:
        parser.error('Unrecognised subcommand: %r' % (command_name,))

    # Setup logging
    log = logging.getLogger(__name__)
    log.setLevel(logging.INFO)
    # create console handler and set level to debug
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    # create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    # add formatter to ch
    ch.setFormatter(formatter)
    log.addHandler(ch)

    if options.debug:
        log.setLevel(logging.DEBUG)
        ch.setLevel(logging.DEBUG)

    command_factory().main(argv=args)
