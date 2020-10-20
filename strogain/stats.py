import os
import re
#import json
import simplejson as json
import datetime
import geopy.distance
import numpy as np
import pandas as pd
from pathlib import Path
from . import course
from . import games

from flask import (
    Blueprint, flash, g, redirect, render_template, request, url_for, json, current_app
)
from werkzeug.exceptions import abort

from strogain.auth import login_required
from strogain.games import load_game

bp = Blueprint('stats', __name__, url_prefix='/stats')


course_meta = None

# --- Routes ----------------------------------------------------------------

@bp.route('/<string:gamedate1>/to/<string:gamedate2>')
@login_required
def statistics(gamedate1, gamedate2, oneround=False):
    if request.args.get('oneround'):
        oneround = request.args.get('oneround')
    uid = g.user['username']
    date_from = datetime.datetime.strptime(gamedate1, "%Y-%m-%d").date()
    date_to   = datetime.datetime.strptime(gamedate2, "%Y-%m-%d").date()
    #daterange = { 'from': date_from, 'to': date_to }
    gamelist = games_in_range(uid, date_from, date_to) # TOOD make secure
    df = load_games_as_dataframe(gamelist, games.gamepath(uid))
    #print(df.head())
    df = calculate_shot_distances(df)
    print(df.head())
    df['par'] = df.apply(set_par_for_hole, axis=1)
    df['sg_cat_from'] = df.apply(lambda r: cat_sg(r, 'from2pin', 'lie'), axis=1)
    df['sg_cat_to']   = df.apply(lambda r: cat_sg(r, 'to2pin', 'result'), axis=1)
    print(df.head())
    df = insert_SG_for_hcps(0, df)
    df = insert_SG_for_hcps(18, df)
    df['sg_category'] = df.apply(fix_teeshot_cat, axis=1)
    df['cat_group'] = df['sg_category'].apply(lambda x: category_groups[x]).astype("category")
    df['cat_group'].cat.set_categories(cat_group_names,inplace=True)

    stats = {
        'sg_details': calc_SG_details(df),
        'sg_group_means': cat_group_means(df),
        'classics': classic_stats(df),
        'scoring': scoring(df)
    }
    #response = current_app.response_class(
    #    response=json.dumps(stats, ignore_nan=True),
    #    mimetype='application/json'
    #)
    #return response
    return render_template('stats/round.html', stats=stats, oneround=oneround)
        #, course=course.get_course_meta('Open.9'))


# --- Load games ------------------------------------------------------------

all_games_rx = re.compile('game-(\d\d\d\d-\d\d-\d\d).json')

# Return a list of all the game filenames for a given date range
def games_in_range(uid, date_from, date_to):
    #dirname = os.path.join(games_path, uid)
    dirname = games.gamepath(uid)
    files = os.listdir(dirname)
    flist = []
    for fname in files:
        #print(fname)
        m = all_games_rx.search(fname)
        if m:
            dstr = m.group(1)
            #print("date = '%s'" % dstr)
            if check_date_range(dstr, date_from, date_to):
                flist.append(fname)
    return flist


def process_game_files(game_filenames, games_path, action, initial, *params):
    res = initial
    for gf in game_filenames:
        m = all_games_rx.search(gf)
        game_data_path = os.path.join(games_path, gf)
        with open(game_data_path, 'r') as f:
            game = json.load(f)
            print("Processing game %s" % gf)
            res = action(game, m.group(1), initial, *params)
    return res


def load_game_action(game, gdate, initial, *params):
    holes = [ holeno for holeno in game['game']]
    print("Game has holes", holes)
    df = initial
    for h in holes:
        if h not in game['game'] or 'strokes' not in game['game'][h]:
            continue
        strokes = game['game'][h]['strokes']
        for s in strokes:
            row = {
                'round': gdate,
                'hole': h,
                'stroke': int(s['stroke']),
                'from': s['from'],
                'to': s['to'],
                'lie': s['lie'],
                'result': s['result'],
                'pin': game['game'][h]['pin']
            }
            #print(row)
            df = df.append(row, ignore_index=True)
    return df


def load_games_as_dataframe(game_filenames, games_path):
    df = pd.DataFrame(columns=['round', 'hole', 'stroke', 'from', 'to', 'lie', 'result', 'pin'])
    df['stroke'] = df['stroke'].astype(int)
    df = process_game_files(game_filenames, games_path, load_game_action, df)
    return df


# --- Functions operating on data frames ------------------------------------

def dist_to_pin(row):
    return geopy.distance.distance(row['from'], row['pin']).m


def rest_to_pin(row):
    return geopy.distance.distance(row['to'], row['pin']).m


def set_par_for_hole(row):
    return par_for_hole(row['hole'])


def calculate_shot_distances(shot_dataframe):
    shot_dataframe['from2pin'] = shot_dataframe.apply(dist_to_pin, axis=1)
    shot_dataframe['to2pin']   = shot_dataframe.apply(rest_to_pin, axis=1)
    shot_dataframe['dist'] = shot_dataframe['from2pin']-shot_dataframe['to2pin']
    shot_dataframe = shot_dataframe.drop(columns=['from', 'to', 'pin'])
    return shot_dataframe

# --- Strokes gained calculations -------------------------------------------

# Get pro's and am's strokes-gained data ordered
def extract_pro_and_am_strokes_gained():
    pro_data_tuples = sorted(sg_table_pros.items(), key=sg_cat_key)
    _, pro_strokes_gained_list = zip(*pro_data_tuples) # unpack a list of pairs into two tuples
    am_data_tuples = sorted(sg18_table.items(), key=sg_cat_key)
    _, am_strokes_gained_list = zip(*am_data_tuples)
    return pro_strokes_gained_list, am_strokes_gained_list


def get_strokes_gained_base_data_frame():
    pro_strokes_gained_list, am_strokes_gained_list = extract_pro_and_am_strokes_gained()
    pros = pd.Series(pro_strokes_gained_list)
    ams = pd.Series(am_strokes_gained_list)
    cats, inx = make_category_index()
    #cats = pd.Series(pro_x)
    sgdf = pd.DataFrame({
        'Category': cats,
        'Seq': inx,
        'Pro': pros,
        'Am18': ams
    }).set_index('Category')
    return sgdf, cats


def hcp_sg(hcp, cat):
    cat_row = sgdf.loc[cat]
    sg = interp(hcp/18, (cat_row['Pro'], cat_row['Am18']))
    #print(cat_row)
    return sg


def teeshot_sg(hcp, distance):
    t200 = hcp_sg(hcp, 'Tee-200')
    t400 = hcp_sg(hcp, 'Tee-400')
    #print("%.2f / %.2f" % (t200, t400))
    return interp((distance-200)/200, (t200, t400))


def insert_SG_for_hcps(hcp, df):
    def local_sg(row):
        cat = row['sg_cat_from']
        mysg = hcp_sg(hcp, cat)
        if cat == 'tee-200' or cat == 'Tee-400':
            #print("interpolating SG for tee shot")
            mysg = teeshot_sg(hcp, row['from2pin'])
        #print("my sg = %.2f" % mysg)
        result_sg = hcp_sg(hcp, row['sg_cat_to'])
        #print("-> sg = %.2f" % result_sg)
        return mysg - result_sg - 1
    
    df['SG-'+str(hcp)] = df.apply(local_sg, axis=1)
    #return local_sg(row)
    return df


def fix_teeshot_cat(row):
    cat_from = row['sg_cat_from']
    if row['lie'] == "T" and row['par'] == 3:
        row['lie'] = "F"
        cat_from = cat_sg(row, 'from2pin', 'lie')
        #print(cat_from)
    return cat_from


# --- Strokes gained Summaries ----------------------------------------------


def calc_SG_details(df):
    dfx = df[['sg_category', 'SG-0', 'SG-18']]
    df_sg_means = pd.pivot_table(dfx, index='sg_category')
    m0 = df_sg_means  #['SG-0']
    m0 = m0.reindex(cats).drop(['holed', 'Tee-200'])
    #m0 = m0.drop(['holed', 'Tee-200'])
    SG_details_table = pd.DataFrame(m0)
    SG_details_table['label'] = SG_details_table.apply(lambda row: sg_official[row.name], axis=1)
    return SG_details_table.to_dict(orient='records')


# --- SG Categories ---------------------------------------------------------

cat_group_names = ["Putting","Around the Green","Approach","Driving"]

def cat_group_means(df):
    dfy = df[['cat_group', 'SG-0', 'SG-18']]
    group_SG_stats = pd.pivot_table(dfy, index='cat_group') # 'mean' is default aggregator
    group_SG_stats['group_name'] = group_SG_stats.index
    return group_SG_stats.to_dict(orient='records')


# --- Classical Statistics --------------------------------------------------

def classic_stats(df):
    drives = df[['sg_category', 'dist']].where(df['sg_category'] == 'Tee-400', axis=0)
    driving_distance = drives.quantile(.8, axis=0)[0]
    
    greens = df[['round', 'hole', 'stroke', 'par', 'result']]
    ongreen = greens['result']=="G"
    inhole  = greens['result']=="H"
    greens = greens.where(ongreen | inhole)    
    gir = pd.pivot_table(greens, index=['round', 'hole'], values=['stroke', 'par'], aggfunc=np.min)
    gir['GiR'] = gir['par'] - gir['stroke'] - 2
    gir = gir.drop(['stroke'], axis=1)
    gir['hole'] = gir.index
    gir_dict = gir.to_dict(orient='records')
    GiR_percentage = len(gir[gir['GiR'] >= 0].index)/(len(gir.index))*100.0
    
    fw = df[['round', 'hole', 'stroke', 'sg_category', 'result']]
    onfw  = fw['result']=="F"
    istee = fw['sg_category']=="Tee-400"
    fw = fw.where(istee)
    teeshot_count = len(fw.loc[fw['result'].notna()])
    fw = fw.where(onfw)
    fw_count = len(fw.loc[fw['result'].notna()])
    fw_hit = fw_count/teeshot_count*100.0
    fw = fw.where(fw['stroke']< 1.5)
    fw = fw[['round', 'hole', 'result']]
    fw = fw.loc[fw['result'].notna()]
    fw['inx'] = fw['round'] + '_' + fw['hole']
    fw = fw.drop(['hole', 'round'], axis=1)
    fw = fw.set_index(['inx'])
    fw_dict = fw.to_dict(orient='index')
    #fw_dict = fw.to_dict(orient='records')

    stats = {
        "driving_distance": driving_distance,
        "GiR": gir_dict,
        "GiR_pcnt": GiR_percentage,
        "FW_hit": fw_dict,
        "FW_pcnt": fw_hit
    }
    return stats


def scoring(df):
    h = df.loc[df['result']=="H"][['hole','par','stroke']]
    h = pd.pivot_table(h, index=["par"])
    h['par'] = h.index
    return h.to_dict(orient="records")


# ---------------------------------------------------------------------------

# row is a dataframe row, distance_col selects either start position or resulting position.
# lie is one of H (holed), G (on the green), F (fairway), B (bunker), R (rough), T (tee).
def cat_sg(row, distance_col, lie):
    d = row[distance_col]
    l = row[lie]
    cat = "other"
    if l == "H":
        cat = "holed"
    elif l == "G":
        if d <= 1.2:
            cat = "Putt-1"
        elif d <= 3:
            cat = "Putt-3"
        else:
            cat = "Putt"
    elif l == "B":
        if d <= 30:
            cat = "Bunker-Green"
        elif d <= 70:
            cat = "Bunker-70"
        elif d <= 70:
            cat = "Bunker-100"
        else:
            cat = "Bunker-150"
    elif l == "F" or l == "R":
        if d <= 20:
            cat = "Short-20"
        elif d <= 40:
            cat = "Short-40_" + l
        elif d <= 70:
            cat = "Appr-70_" + l
        elif d <= 110:
            cat = "Appr-110_" + l
        elif d <= 150:
            cat = "Appr-150_" + l
        elif d <= 180:
            cat = "Appr-180_" + l
        else:
            cat = "Appr-long"
    elif l == "T":
        if d <= 200:
            cat = "Tee-200"
        else:
            cat = "Tee-400"
            
    return cat


# --- Helpers ---------------------------------------------------------------

def interp(f, intv):
    return f*(intv[1]-intv[0])+intv[0]


def sg_cat_key(elem):
    return sg_sort[elem[0]]


def make_category_index():
    order = sorted(sg_sort.items(), key=sg_cat_key)
    cat_names_ordered, cat_index = zip(*order)
    return cat_names_ordered, cat_index


# Check if a date is within a certain range
def check_date_range(date_as_string, date_from, date_to):
    d = datetime.datetime.strptime(date_as_string, "%Y-%m-%d").date()
    return date_from <= d <= date_to


def par_for_hole(holeno):
    return course.get_course_meta('Open.9')['holes'][str(holeno)]['par']


# --- Base Tables -----------------------------------------------------------

sg_table_pros = {
    "holed": 0,
    "Putt-1": 1.04,
    "Putt-3": 1.42,
    "Putt-10": 1.87,
    "Putt": 2.4,
    "Short-20": 2.6,
    "Short-40_F": 2.65,
    "Short-40_R": 2.8,
    "Appr-70_F": 2.75,
    "Appr-70_R": 2.96,
    "Appr-110_F": 2.85,
    "Appr-110_R": 3.08,
    "Appr-150_F": 2.98,
    "Appr-150_R": 3.23,
    "Appr-180_F": 3.19,
    "Appr-180_R": 3.42,
    "Appr-long": 3.6,
    "Bunker-Green": 2.82,
    "Bunker-70": 3.2,
    "Bunker-110": 3.25,
    "Bunker-150": 3.3,
    "Tee-200": 3.17,
    "Tee-400": 4.08
}

sg18_table = {
    "holed": 0,
    "Putt-1": 1.1,
    "Putt-3": 1.8,
    "Putt-10": 2.19,
    "Putt": 2.65,
    "Short-20": 2.75,
    "Short-40_F": 2.9,
    "Short-40_R": 3,
    "Appr-70_F": 3,
    "Appr-70_R": 3.17,
    "Appr-110_F": 3.15,
    "Appr-110_R": 3.31,
    "Appr-150_F": 3.34,
    "Appr-150_R": 3.44,
    "Appr-180_F": 3.58,
    "Appr-180_R": 3.71,
    "Appr-long": 3.89,
    "Bunker-Green": 3.15,
    "Bunker-70": 3.41,
    "Bunker-110": 3.48,
    "Bunker-150": 3.51,
    "Tee-200": 3.9,
    "Tee-400": 5.2
}

sg_sort = {
    "holed": 0,
    "Putt-1": 1,
    "Putt-3": 2,
    "Putt-10": 3,
    "Putt": 4,
    "Short-20": 5,
    "Short-40_F": 6,
    "Short-40_R": 7,
    "Appr-70_F": 8,
    "Appr-110_F": 9,
    "Appr-150_F": 10,
    "Appr-180_F": 11,
    "Appr-70_R": 12,
    "Appr-110_R": 13,
    "Appr-150_R": 14,
    "Appr-180_R": 15,
    "Appr-long": 16,
    "Bunker-Green": 17,
    "Bunker-70": 18,
    "Bunker-110": 19,
    "Bunker-150": 20,
    "Tee-200": 21,
    "Tee-400": 22
}

sg_official = {
    "holed": "",
    "Putt-1": "Putt ≤ 1m",
    "Putt-3": "Putt ≤ 3m",
    "Putt-10": "Putt ≤ 10m",
    "Putt": "Distance Putt",
    "Short-20": "Around Green ≤ 20m",
    "Short-40_F": "Around Green ≤ 40m",
    "Short-40_R": "Around Green ≤ 40m from Rough",
    "Appr-70_F": "Approach ≤ 70m from Fairway",
    "Appr-110_F": "Approach ≤ 110m from Fairway",
    "Appr-150_F": "Approach ≤ 150m from Fairway",
    "Appr-180_F": "Approach ≤ 180m from Fairway",
    "Appr-70_R": "Approach ≤ 70m from Rough",
    "Appr-110_R": "Approach ≤ 110m from Rough",
    "Appr-150_R": "Approach ≤ 150m from Rough",
    "Appr-180_R": "Approach ≤ 180m from Rough",
    "Appr-long": "Long Approach",
    "Bunker-Green": "Greenside Bunker",
    "Bunker-70": "Long Bunker Shot",
    "Bunker-110": "Short Fairway Bunker Shot",
    "Bunker-150": "Long Fairway Bunker Shot",
    "Tee-200": "",
    "Tee-400": "Tee Shot"
}

category_groups = {
    "holed": '',
    "Putt-1": 'Putting',
    "Putt-3": 'Putting',
    "Putt-10": 'Putting',
    "Putt": 'Putting',
    "Short-20": 'Around the Green',
    "Short-40_F": 'Around the Green',
    "Short-40_R": 'Around the Green',
    "Appr-70_F": 'Approach',
    "Appr-110_F": 'Approach',
    "Appr-150_F": 'Approach',
    "Appr-180_F": 'Approach',
    "Appr-70_R": 'Approach',
    "Appr-110_R": 'Approach',
    "Appr-150_R": 'Approach',
    "Appr-180_R": 'Approach',
    "Appr-long": 'Approach',
    "Bunker-Green": 'Around the Green',
    "Bunker-70": 'Around the Green',
    "Bunker-110": 'Approach',
    "Bunker-150": 'Approach',
    "Tee-200": '',
    "Tee-400": 'Driving'
}

# --- Top level executable code ---------------------------------------------

sgdf, cats = get_strokes_gained_base_data_frame()

