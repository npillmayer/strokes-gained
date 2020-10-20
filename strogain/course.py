import os
import re

from flask import (
    Blueprint, flash, g, redirect, render_template, request, url_for, json, current_app
)
from werkzeug.exceptions import abort

bp = Blueprint('course', __name__, url_prefix='/course')

def load_course_meta(coursename):
    print("loading course meta for %s" % coursename)
    filename = os.path.join(current_app.static_folder, coursename, 'course.json')
    courseinfo = None
    with open(filename, 'r') as f:
        courseinfo = json.load(f)
    return courseinfo


def get_course_meta(coursename):
    if 'meta' not in g:
        g.meta = {}
    if coursename not in g.meta:
        g.meta[coursename] = load_course_meta(coursename)
    return g.meta[coursename]

@bp.route('/<string:id>/meta')
def load(id):
    courseinfo = load_course_meta(id)
    response = current_app.response_class(
        response=json.dumps(courseinfo),
        mimetype='application/json'
    )
    return response


@bp.route('/<string:id>/fairway/<int:hole>')
def fairway(id, hole):
    filename = os.path.join(current_app.static_folder, id, str(hole)+'_Fairway.geojson')
    with open(filename, 'r') as f:
        fw_one = json.load(f)
    response = current_app.response_class(
        response=json.dumps(fw_one),
        mimetype='application/json'
    )
    return response


@bp.route('/<string:id>/green/<int:hole>')
def green(id, hole):
    filename = os.path.join(current_app.static_folder, id, str(hole)+'_Green.geojson')
    with open(filename, 'r') as f:
        g_one = json.load(f)
    response = current_app.response_class(
        response=json.dumps(g_one),
        mimetype='application/json'
    )
    return response


@bp.route('/<string:id>/bunkers/<int:hole>')
def bunkers(id, hole):
    dirname = os.path.join(current_app.static_folder, id)
    files = os.listdir(dirname)
    rx = re.compile(str(hole) + '_\d*_Bunker.geojson')
    flist = [ x for x in files if rx.search(x) ]
    #blist = " ".join(filter(rx.search, files))
    bunkers = []
    if len(flist) > 0:
        for filename in flist:
            path = os.path.join(dirname, filename)
            with open(path, 'r') as f:
                contour = json.load(f)
                bunkers.append(contour)
    response = current_app.response_class(
        response=json.dumps(bunkers),
        mimetype='application/json'
    )
    return response



