require('dotenv').load({silent: true});
const express = require('express');
const nunjucks = require('nunjucks');
const app = express();
const port = process.env.PORT || 3000;
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});
const _ = require('underscore');
const crypto = require('crypto');
const axios = require('axios');

const secret = '2hYj5C9XHdPEKFUMmrxwKbQY';

pool.connect().then(client => {
    return client.query("CREATE TABLE IF NOT EXISTS helpnotice(id serial PRIMARY KEY,name varchar(255) NOT NULL, passcode varchar(255) NOT NULL, msg varchar(255) NOT NULL, tags varchar(400), twitter varchar(255),status varchar(255) NOT NULL DEFAULT 'open')")
        .then(res => {
            console.log('all good');
            client.release()
        })
        .catch(e => {
            console.log('error: '+e);
            client.release()
        })
});

const bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

app.use(express.json());       // to support JSON-encoded bodies
app.use(express.urlencoded()); // to support URL-encoded bodies

nunjucks.configure('views', {
    autoescape: true,
    express: app
});

// respond with "hello world" when a GET request is made to the homepage

app.get('/submit', function (req, res) {
    res.render('submit.html', {});
});

app.get('/view/:id', async (req, res) => {
    try {
        const client = await pool.connect()
        const result = await client.query('SELECT id,name,msg,tags,twitter,status FROM helpnotice where id = $1', [req.params.id]);
        const notice = (result) ? result.rows : null;
        client.release();
        res.render('view.html', {notice:JSON.stringify(notice)});
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});

app.get('/update/:id', async (req, res) => {
    try {
        const client = await pool.connect()
        const result = await client.query('SELECT id,name,msg,tags,twitter,status FROM helpnotice where id = $1', [req.params.id]);
        const notice = (result) ? result.rows : null;
        client.release();        
        if(!Array.isArray(JSON.parse(notice[0].tags))){
            var tags = '['+notice[0].tags+']';
        }else{
            var tags = JSON.parse(notice[0].tags);
        }
        res.render('update.html', {notice:notice, issue: _.unescape(notice[0].msg), tags:tags, error:false});
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});

app.post('/update/:id', async (req, res) => {
    const results = [];
    const data = req.body;
    try {
        const client = await pool.connect()
        const result = await client.query('SELECT passcode FROM helpnotice where id = $1', [data.id]);
        const notice = (result) ? result.rows : null;

        let passcode = crypto.createHmac('sha256',secret)
            .update(data.passcode)
            .digest('hex');

        console.log(passcode);
        let msg = _.escape(data.msg);
        let tags = JSON.stringify([data.tags]);


        if(notice[0].passcode === passcode){

            if(data.status === 'closed'){
                try {
                    const client = await pool.connect()
                    let insert = await client.query('delete from helpnotice WHERE id=$1',[data.id]);
                    client.release();
                    res.redirect('/');
                } catch (err) {
                    console.error(err);
                    res.send("Error " + err);
                }         
            }else{
                try {
                    const client = await pool.connect()
                    let insert = await client.query('update helpnotice set name=$1, msg=$2, status=$3, twitter=$4, tags=$5 WHERE id=$6',[data.name, msg, data.status, data.twitter, tags, data.id]);
                    client.release();
                    res.redirect('/');
                } catch (err) {
                    console.error(err);
                    res.send("Error " + err);
                }  
            }    
        }else{
            console.error('passcode not match');
            res.send("Error: passcode not match did not update ");         
        }

        client.release();
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});

app.post('/submit', async (req, res) => {
    const results = [];
    // Grab data from http request
    const data = req.body;
    // Get a Postgres client from the connection pool

    let msg = _.escape(data.msg);
    //let msg = data.msg;
    let passcode = crypto.createHmac('sha256',secret)
                   .update(data.passcode)
                   .digest('hex');

    let tags = JSON.stringify(data.tags);

        try {
            const client = await pool.connect()
            let insert = await client.query('INSERT INTO helpnotice(name, passcode, msg, status, twitter, tags) values($1, $2, $3, $4, $5, $6)  RETURNING id',[data.name, passcode, msg, data.status, data.twitter, tags]);
            client.release();
            axios.post('https://hooks.slack.com/services/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', {
                text: 'New Help Request Submitted: https://hackference-helper.herokuapp.com/view/'+insert.rows[0].id,
              })
              .then(function (response) {
                console.log(response);
              })
              .catch(function (error) {
                console.log(error);
              });
            res.redirect('/');
        } catch (err) {
            console.error(err);
            res.send("Error " + err);
        }
});



app.get('/', async (req, res) => {
    try {
        const client = await pool.connect()
        const result = await client.query('SELECT id,name,msg,tags,twitter,status FROM helpnotice order by id');
        const results = (result) ? result.rows : null;
        client.release();
        res.render('home.html', { notices: JSON.stringify(results)});
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }

})

app.listen(port, () => console.log(`Example app listening on port ${port}!`));