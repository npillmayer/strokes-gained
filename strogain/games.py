import os
from pathlib import Path
from flask import (
    Blueprint, flash, g, redirect, render_template, request, url_for, json, current_app
)
from werkzeug.exceptions import abort

from strogain.auth import login_required

bp = Blueprint('game', __name__, url_prefix='/game')

def load_game(username, gamedate):
    path = gamepath(username)
    filename = os.path.join(path, "game-" + gamedate + '.json')
    game = {}
    with open(filename, 'r') as f:
        game = json.load(f)
    return game


def store_game(username, gamedate, payload):
    path = gamepath(username)
    Path(path).mkdir(parents=True, exist_ok=True)
    filename = os.path.join(path, "game-" + gamedate + '.json')
    with open(filename, 'w') as f:
        game = json.dump(payload, f)


@bp.route('/<string:gamedate>')
@login_required
def load(gamedate):
    uid = g.user['username']
    r = ""
    try:
        game = load_game(uid, gamedate)
        r = json.dumps(game)
    except:
        print("No game to load")

    response = current_app.response_class(
        response=r,
        mimetype='application/json'
    )
    return response


@bp.route('/<string:gamedate>/store', methods=('GET', 'POST'))
@login_required
def store(gamedate):
    #def store(gamedate, payload):
    uid = g.user['username']
    if request.method == 'POST':
        #payload = request.form.get('payload')
        payload = request.json
        print("PAYLOAD:")
        print(payload)
        #store_game(uid, gamedate, payload)
        response = current_app.response_class(
            response='{ "hello": ' + json.dumps(payload) + ' }',
            mimetype='application/json'
        )
        return response

    response = current_app.response_class(
        response='{ "error": "GET not allowed" }',
        mimetype='application/json'
    )
    return response


def gamepath(username):
    return os.path.join(current_app.instance_path, "games", username)

