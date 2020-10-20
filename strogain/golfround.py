from sqlite3 import Error
#from datetime import date
import datetime
from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)
from werkzeug.exceptions import abort

from strogain.auth import login_required
from strogain.db import get_db
from strogain.course import load_course_meta
from strogain.games import store_game
from json import dumps, loads

bp = Blueprint('golfround', __name__)


@bp.route('/list', methods=('POST','GET'))
def list():
    print(request.form)
    print("session filter from = %s" % session.get('filter_from'))
    print("session filter to   = %s" % session.get('filter_to'))
    datefrom = request.form.get('datefrom')
    dateto   = request.form.get('dateto')
    if request.method == 'POST':
        session['filter_from'] = datefrom
        session['filter_to'] = dateto
    else:
        datefrom = session.get('filter_from')
        dateto = session.get('filter_to')
    print("now session filter from = %s" % session.get('filter_from'))
    print("now session filter to   = %s" % session.get('filter_to'))
    df = None
    dt = None
    if datefrom:
        df = datetime.datetime.strptime(datefrom, '%Y-%m-%d').date()
    if dateto:
        dt = datetime.datetime.strptime(dateto, '%Y-%m-%d').date()
    print("datefrom = %s, dateto = %s" % (datefrom, dateto))
    #else:
    #    if not datefrom:
    #        if session.get('filter_from'):
    #            datefrom = session['filter_from']
    #            df = datetime.datetime.strptime(datefrom, '%Y-%m-%d').date()
    #    else:
    #        session['filter_from'] = datefrom
    #        df = datetime.datetime.strptime(datefrom, '%Y-%m-%d').date()
    #    if not dateto:
    #        if session.get('filter_to'):
    #            dateto = session['filter_to']
    #            dt = datetime.datetime.strptime(dateto, '%Y-%m-%d').date()
    #    else:
    #        session['filter_to'] = dateto
    #        dt = datetime.datetime.strptime(dateto, '%Y-%m-%d').date()

    db = get_db()
    if not df:
        df = datetime.datetime.strptime("2000-01-01", '%Y-%m-%d').date()
    if not dt:
        dt = datetime.date.today()

    if request.form.get('action') == 'Statistik':
        print("STATISTIK for (%s, %s)" % (df, dt))
        return redirect(url_for('stats.statistics', gamedate1=df, gamedate2=dt))

    print("SQL query for (%s, %s)" % (df, dt))
    rounds = db.execute(
        'SELECT r.id, player, course, day, score, descr'
        ' FROM round r JOIN user u ON r.player = u.username'
        ' WHERE day BETWEEN :dfrom AND :dto'
        ' ORDER BY day DESC',
        { 'dfrom': df, 'dto': dt }
    ).fetchall()
    return render_template('round/index.html', rounds=rounds, datefrom=datefrom, dateto=dateto)


@bp.route('/', methods=('GET', 'POST'))
def index():
    return render_template('intro.html')


@bp.route('/create', methods=('GET', 'POST'))
@login_required
def create():
    if request.method == 'POST':
        day = request.form['day']
        descr = request.form['descr']
        tees = request.form['tees']
        error = None

        if not tees:
            error = 'Tees müssen ausgewählt werden'

        if error is not None:
            flash(error)
        else:
            db = get_db()
            try:
                db.execute(
                    'INSERT INTO round (player, course, day, tees, descr)'
                    ' VALUES (?, ?, ?, ?, ?)',
                    (g.user['username'], "Open.9", day, tees, descr)
                )
                db.commit()
                return redirect(url_for('golfround.list'))
            except Error as e:
                print("An error occurred:", e.args[0])
                flash("Fehler beim Anlegen der Runde in der Datenbank")

            return redirect(url_for('golfround.list'))

    return render_template('round/create.html', day=datetime.date.today())


def get_round(id, check_player=True):
    round = get_db().execute(
        'SELECT id, player, course, day, score, tees, descr'
        ' FROM round r'
        ' WHERE id = ?',
        (id,)
    ).fetchone()
    if round is None:
        abort(404, "Round id {0} doesn't exist.".format(id))
    if check_player and round['player'] != g.user['username']:
        abort(403)
    return round


@bp.route('/<int:id>/update', methods=('GET', 'POST'))
@login_required
def update(id):
    if request.method == 'POST':
        uid = g.user['username']
        #j = request.json
        #print(j)
        day = request.form['day']
        score = request.form['score']
        game = request.form['game']
        print('game = ', game)
        error = None
        try:
            store_game(uid, day, loads(game))
        except:
            error = 'Schläge konnten nicht gespeichert werden!'

        if error is not None:
            flash(error, 'is-danger')
        else:
            db = get_db()
            db.execute(
                'UPDATE round SET score = ?'
                ' WHERE id = ?',
                (score, id)
            )
            db.commit()
            flash('Schläge gespeichert', 'is-success')
            return redirect(url_for('golfround.list'))

    golfround = get_round(id)
    coursemeta = load_course_meta(golfround['course'])
    return render_template('round/update.html', round=golfround, coursemeta=coursemeta)


@bp.route('/<int:id>/delete', methods=('POST',))
@login_required
def delete(id):
    get_round(id)
    db = get_db()
    db.execute('DELETE FROM round WHERE id = ?', (id,))
    db.commit()
    return redirect(url_for('golfround.list'))

