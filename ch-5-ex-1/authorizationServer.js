var express = require("express");
var url = require("url");
var bodyParser = require('body-parser');
var randomstring = require("randomstring");
var cons = require('consolidate');
var nosql = require('nosql').load('database.nosql');
var querystring = require('querystring');
var __ = require('underscore');
const { decode } = require("punycode");
__.string = require('underscore.string');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for the token endpoint)

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/authorizationServer');
app.set('json spaces', 4);

// authorization server information
var authServer = {
	authorizationEndpoint: 'http://localhost:9001/authorize',
	tokenEndpoint: 'http://localhost:9001/token'
};

// client information
var clients = [
	{
		"client_id": "oauth-client-1",
		"client_secret": "oauth-client-secret-1",
		"redirect_uris": ["http://localhost:9000/callback"],
	}
];

var codes = {};

var requests = {};

var getClient = function(clientId) {
	return __.find(clients, function(client) { return client.client_id == clientId; });
};

app.get('/', function(req, res) {
	res.render('index', {clients: clients, authServer: authServer});
});

app.get("/authorize", function(req, res){

	var client = getClient(req.query.client_id);
	if(!client) {
		res.render('error',  {error: 'Unknown client' });
		return;
	} else if(!__.contains(client.redirect_uris, req.query.redirect_uri)) {
		res.render('error', { error: 'Invalid redirect URI'});
		return;
	} else {
		var reqid = randomstring.generate(8);
		requests[reqid] = req.query;
		res.render('approve', { client: client, reqid: reqid });
		return;
	}
});

app.post('/approve', function(req, res) {
	var reqid = req.body.reqid;
	var query = requests[reqid];
	delete requests[reqid];

	if(!query) {
		res.render('error', { error: 'No matching authorization request' });
		return;
	}
	if(req.body.approve) {
		if(query.response_type == 'code') {
			var code = randomstring.generate(8);
			codes[code] = { request: query};
			var urlParsed = buildUrl(query.redirect_uri, {code: code, state: query.state});
			res.redirect(urlParsed);
			return;

		} else {
			var urlParsed = buildUrl(query.redirect_uri, {error: 'unsupported_response_type'});
			res.redirect(urlParsed);
			return;
		}

	} else {
		var urlParsed = buildUrl(query.redirect_uri, { error: 'access_denied'});
		res.redirect(urlParsed);
		return;
	}


});

app.post("/token", function(req, res){

	var auth = req.headers['authorization'];
	if(auth) {
		var clientCredentials = decodeClientCredentials(auth);
		var clientId = clientCredentials.id;
		var clientSecret = clientCredentials.secret;
	}
	if(req.body.client_id) {
		if(clientId) {
			res.status(401).json({ error: 'Invalid_client'});
			return;
		}
		var clientId = req.body.client_id;
		var clientSecret = req.body.client_secret;
	}
	var client = getClient(clientId);
	if(!client) {
		res.status(401).json({ error: 'Invalid_client'});
		return;
	}
	if(client.client_secret != clientSecret) {
		res.status(401).json({ error: 'Invalid_client'});
		return;
	}
	if(req.body.grant_type == 'authorization_code') {
		var code = codes[req.body.code];
		if(code) {
			delete codes[req.body.code];
			if(code.request.client_id == clientId) {
				var access_token = randomstring.generate();
				nosql.insert({ access_token: access_token, client_id: clientId});
				var token_response = {
					access_token: access_token,
					token_type: 'Bearer'
				};
				res.status(200).json(token_response);
				return;

			} else {
				res.status(400).json({error: 'Invalid_grant'});
				return;
			}

		} else {
			res.status(400).json({ error: 'Invalid_grant'});
			retrurn;
		}

	} else {
		res.status(401).json({ error: 'Unsupported_grant_type'});
		return;
	}

});

var buildUrl = function(base, options, hash) {
	var newUrl = url.parse(base, true);
	delete newUrl.search;
	if (!newUrl.query) {
		newUrl.query = {};
	}
	__.each(options, function(value, key, list) {
		newUrl.query[key] = value;
	});
	if (hash) {
		newUrl.hash = hash;
	}

	return url.format(newUrl);
};

var decodeClientCredentials = function(auth) {
	var clientCredentials = Buffer.from(auth.slice('basic '.length), 'base64').toString().split(':');
	var clientId = querystring.unescape(clientCredentials[0]);
	var clientSecret = querystring.unescape(clientCredentials[1]);
	return { id: clientId, secret: clientSecret };
};

app.use('/', express.static('files/authorizationServer'));

// clear the database
nosql.clear();

var server = app.listen(9001, 'localhost', function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('OAuth Authorization Server is listening at http://%s:%s', host, port);
});

