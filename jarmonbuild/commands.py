# Copyright (c) 2010 Richard Wall <richard (at) the-moon.net>
"""
Functions and Classes for automating the release of Jarmon
"""

import hashlib
import os
import shutil
import sys

from subprocess import check_call
from tempfile import gettempdir
from urllib2 import urlopen
from zipfile import ZipFile

JARMON_VERSION='10.8'
JARMON_PROJECT_TITLE='Jarmon'
JARMON_PROJECT_URL='http://www.launchpad.net/jarmon'

YUIDOC_URL = 'http://yuilibrary.com/downloads/yuidoc/yuidoc_1.0.0b1.zip'
YUIDOC_MD5 = 'cd5545d2dec8f7afe3d18e793538162c'


class BuildError(Exception):
    """
    A base Exception for errors in the build system
    """
    pass


class BuildApidocsCommand(object):
    """
    Download YUI Doc and use it to generate apidocs for jarmon
    """

    def __init__(self, _stdout=sys.stdout, _stderr=sys.stderr):
        self.stdout = _stdout
        self.stderr = _stderr

    def log(self, message, newline=os.linesep):
        """
        @param message: A message to be logged
        @param newline: The newline string to be appended to the message. Use
            '' to prevent a newline
        """
        self.stderr.write(''.join((message, newline)))

    def main(self, argv=sys.argv[1:]):
        """
        The main entry point for the build-apidocs command

        @param argv: The list of arguments passed to the build-apidocs command
        """
        tmpdir = gettempdir()
        workingbranch_dir = os.path.join(os.path.dirname(__file__), '..')

        # setup working dir
        build_dir = os.path.join(workingbranch_dir, 'build')
        if not os.path.isdir(build_dir):
            self.log('Creating working dir: %s' % (build_dir,))
            os.mkdir(build_dir)
        else:
            self.log('Using working dir: %s' % (build_dir,))

        # download and cache yuidoc
        yuizip_path = os.path.join(tmpdir, os.path.basename(YUIDOC_URL))
        if os.path.exists(yuizip_path):
            def producer():
                self.log('Using cached YUI doc')
                yield open(yuizip_path).read()
        else:
            def producer():
                with open(yuizip_path, 'w') as yuizip:
                    self.log('Downloading YUI Doc', newline='')
                    download = urlopen(YUIDOC_URL)
                    while True:
                        bytes = download.read(1024*10)
                        if not bytes:
                            self.log('')
                            break
                        else:
                            yuizip.write(bytes)
                            self.log('.', newline='')
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
            self.log('YUI Doc checksum verified')

        # Remove any existing apidocs so that we can track removed files
        shutil.rmtree(os.path.join(build_dir, 'docs', 'apidocs'), True)

        yuidoc_dir = os.path.join(build_dir, 'yuidoc')

        # extract yuidoc folder from the downloaded zip file
        self.log('Extracting YUI Doc from %s to %s' % (yuizip_path, yuidoc_dir))
        zip = ZipFile(yuizip_path)
        zip.extractall(
            build_dir, (m for m in zip.namelist() if m.startswith('yuidoc')))

        # Use the yuidoc script that we just extracted to generate new docs
        self.log('Running YUI Doc')
        check_call((
            sys.executable,
            os.path.join(yuidoc_dir, 'bin', 'yuidoc.py'),
            workingbranch_dir,
            '--parseroutdir=%s' % (
                os.path.join(build_dir, 'docs', 'apidocs'),),
            '--outputdir=%s' % (
                os.path.join(build_dir, 'docs', 'apidocs'),),
            '--template=%s' % (
                os.path.join(
                    workingbranch_dir, 'jarmonbuild', 'yuidoc_template'),),
            '--version=%s' % (JARMON_VERSION,),
            '--project=%s' % (JARMON_PROJECT_TITLE,),
            '--projecturl=%s' % (JARMON_PROJECT_URL,)
        ))

        shutil.rmtree(yuidoc_dir)
