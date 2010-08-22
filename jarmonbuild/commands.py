# Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
"""
Functions and Classes for automating the release of Jarmon
"""

import hashlib
import logging
import os
import shutil
import sys

from optparse import OptionParser
from subprocess import check_call
from tempfile import gettempdir
from urllib2 import urlopen
from zipfile import ZipFile, ZIP_DEFLATED


JARMON_PROJECT_TITLE='Jarmon'
JARMON_PROJECT_URL='http://www.launchpad.net/jarmon'

YUIDOC_URL = 'http://yuilibrary.com/downloads/yuidoc/yuidoc_1.0.0b1.zip'
YUIDOC_MD5 = 'cd5545d2dec8f7afe3d18e793538162c'


class BuildError(Exception):
    """
    A base Exception for errors in the build system
    """
    pass


class BuildCommand(object):
    def __init__(self, buildversion, log=None):
        self.buildversion = buildversion
        if log is not None:
            self.log = log
        else:
            self.log = logging.getLogger()


class BuildApidocsCommand(BuildCommand):
    """
    Download YUI Doc and use it to generate apidocs for jarmon
    """

    def main(self, argv):
        """
        The main entry point for the build-apidocs command

        @param argv: The list of arguments passed to the build-apidocs command
        """
        tmpdir = gettempdir()
        workingbranch_dir = os.path.join(os.path.dirname(__file__), '..')

        # setup working dir
        build_dir = os.path.join(workingbranch_dir, 'build')
        if not os.path.isdir(build_dir):
            self.log.debug('Creating working dir: %s' % (build_dir,))
            os.mkdir(build_dir)
        else:
            self.log.debug('Using working dir: %s' % (build_dir,))

        # download and cache yuidoc
        yuizip_path = os.path.join(tmpdir, os.path.basename(YUIDOC_URL))
        if os.path.exists(yuizip_path):
            def producer():
                self.log.debug('Using cached YUI doc')
                yield open(yuizip_path).read()
        else:
            def producer():
                with open(yuizip_path, 'w') as yuizip:
                    self.log.debug('Downloading YUI Doc')
                    download = urlopen(YUIDOC_URL)
                    while True:
                        bytes = download.read(1024*10)
                        if not bytes:
                            break
                        else:
                            yuizip.write(bytes)
                            yield bytes

        checksum = hashlib.md5()
        for bytes in producer():
            checksum.update(bytes)

        actual_md5 = checksum.hexdigest()
        if actual_md5 != YUIDOC_MD5:
            raise BuildError(
                'YUI Doc checksum error. File: %s, '
                'Expected: %s, Got: %s' % (yuizip_path, YUIDOC_MD5, actual_md5))
        else:
            self.log.debug('YUI Doc checksum verified')

        # Remove any existing apidocs so that we can track removed files
        shutil.rmtree(os.path.join(build_dir, 'docs', 'apidocs'), True)

        yuidoc_dir = os.path.join(build_dir, 'yuidoc')

        # extract yuidoc folder from the downloaded zip file
        self.log.debug('Extracting YUI Doc from %s to %s' % (yuizip_path, yuidoc_dir))
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
            '--version=%s' % (self.buildversion,),
            '--project=%s' % (JARMON_PROJECT_TITLE,),
            '--projecturl=%s' % (JARMON_PROJECT_URL,)
        ))

        shutil.rmtree(yuidoc_dir)


class BuildReleaseCommand(BuildCommand):
    """
    Export all source files, generate apidocs and create a zip archive for
    upload to Launchpad.
    """

    def main(self, argv):
        workingbranch_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..'))

        # setup working dir
        build_dir = os.path.join(workingbranch_dir, 'build')

        # Use bzr to export the versioned files to a build folder
        from bzrlib.commands import main as bzr_main
        status = bzr_main(['bzr', 'export', build_dir, workingbranch_dir])
        if status != 0:
            raise BuildError('bzr export failure. Status: %r' % (status,))

        # Record the branch version
        from bzrlib.branch import Branch
        from bzrlib.version_info_formats.format_python import PythonVersionInfoBuilder
        v = PythonVersionInfoBuilder(Branch.open(workingbranch_dir))
        versionfile_path = os.path.join(build_dir, 'jarmonbuild', '_version.py')
        with open(versionfile_path, 'w') as f:
            v.generate(f)

        # Generate apidocs
        BuildApidocsCommand(buildversion=self.buildversion).main(argv)

        # Generate archive
        archive_root = 'jarmon-%s' % (self.buildversion,)
        prefix_len = len(build_dir) + 1
        z = ZipFile('%s.zip' % (archive_root,), 'w', ZIP_DEFLATED)
        try:
            for root, dirs, files in os.walk(build_dir):
                for file in files:
                    z.write(
                        os.path.join(root, file),
                        os.path.join(archive_root, root[prefix_len:], file)
                    )
        finally:
            z.close()


# The available sub commands
build_commands = {
    'apidocs': BuildApidocsCommand,
    'release': BuildReleaseCommand,
}


def main(argv=sys.argv[1:]):
    """
    The root build command which dispatches to various subcommands for eg
    building apidocs and release zip files.
    """

    parser = OptionParser(usage='%prog [options] SUBCOMMAND [options]')
    parser.add_option(
        '-V', '--build-version', dest='buildversion', default='0',
        metavar='BUILDVERSION', help='Specify the build version')
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

    command_factory(buildversion=options.buildversion).main(argv=args)
