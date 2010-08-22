import hashlib
import os
import shutil
import sys

from subprocess import check_call
from urllib2 import urlopen
from zipfile import ZipFile


YUIDOC_URL = 'http://yuilibrary.com/downloads/yuidoc/yuidoc_1.0.0b1.zip'
YUIDOC_MD5 = 'cd5545d2dec8f7afe3d18e793538162c'

class BuildError(Exception):
    pass

class BuildApidocsCommand(object):
    def __init__(self, stdout=sys.stdout, stderr=sys.stderr):
        self.stdout = stdout
        self.stderr = stderr

    def log(self, message, newline=os.linesep):
        self.stderr.write(''.join((message, newline)))

    def main(self, argv=sys.argv):
        workingbranch_dir = os.path.join(os.path.dirname(__file__), '..')

        # setup working dir
        tmpdir = os.path.join(workingbranch_dir, 'build')
        if not os.path.isdir(tmpdir):
            self.log('Creating working dir: %s' % (workingbranch_dir,))
            os.mkdir(tmpdir)
        else:
            self.log('Using working dir: %s' % (workingbranch_dir,))

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
                'YUI Doc checksum error. '
                'Expected: %s, Got: %s' % (YUIDOC_MD5, actual_md5))
        else:
            self.log('YUI Doc checksum verified')

        # extract yuidoc folder from the downloaded zip file
        zip = ZipFile(yuizip_path)
        self.log('Extracting YUI Doc')
        zip.extractall(
            tmpdir, (m for m in zip.namelist() if m.startswith('yuidoc')))

        # Remove any existing apidocs so that we can track removed files
        shutil.rmtree(os.path.join(workingbranch_dir, 'docs', 'apidocs'))

        # Use the yuidoc script that we just extracted to generate new docs
        self.log('Running YUI Doc')
        check_call((
            sys.executable,
            os.path.join(tmpdir, 'yuidoc', 'bin', 'yuidoc.py'),
            workingbranch_dir,
            '-p', os.path.join(workingbranch_dir, 'docs', 'apidocs'),
            '-o', os.path.join(workingbranch_dir, 'docs', 'apidocs'),
            '-t', os.path.join(
                        workingbranch_dir, 'jarmonbuild', 'yuidoc_template'),
            '-v', '10.8',
            '-Y', '2',
            '--project=Jarmon',
            '--projecturl=http://www.launchpad.net/jarmon'
        ))

        self.log('Removing working dir: %s' % (tmpdir,))
        shutil.rmtree(tmpdir)
