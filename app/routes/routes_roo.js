const express = require('express')
const axios = require('axios')
const router = express.Router()
const api_helper = require('../API_helper');
const { response } = require('express');
const Heading = require('../classes/heading.js');
const Commodity = require('../classes/commodity.js');
// const Roo = require('../classes/roo.js');
const ImportedContext = require('../classes/imported_context.js');
const Error_handler = require('../classes/error_handler.js');
const date = require('date-and-time');
const GeographicalArea = require('../classes/geographical_area');
const Link = require('../classes/link');
const Context = require('../classes/context');
const { xor } = require('lodash');
const RooMvp = require('../classes/roo_mvp.js');
const Roo = require('../classes/roo_mvp.js');

require('../classes/global.js');
require('../classes/news.js');
require('../classes/validator.js');

// Add your routes here - above the module.exports line

// Index
router.get(['/roo', '/roo/xi', '/roo/undefined'], function (req, res) {
    var context = new Context(req);
    var rules_of_origin_schemes = global.get_rules_of_origin();
    req.session.data["commodity"] = "";
    res.render('roo/index', {
        'context': context,
        'rules_of_origin_schemes': rules_of_origin_schemes
    });
});

// Country page
router.get(['/roo/country', '/roo/country/:country'], function (req, res) {
    var context = new Context(req);
    var key = req.params["country"] + "";
    if (key == "") {
        key = req.session.data["roo_country"] + "";
    }

    var roo = new Roo(req, key);
    if (req.session.data["commodity"] == "") {
        res.render('roo/country', {
            'context': context,
            'country': roo
        });
    } else {
        var url = 'https://www.trade-tariff.service.gov.uk/api/v2/commodities/' + req.session.data["commodity"];

        axios.get(url)
            .then((response) => {
                c = new Commodity();
                c.pass_request(req);
                c.get_data(response.data);
                res.render('roo/country', {
                    'context': context,
                    'country': roo,
                    'commodity': c
                });
            });

    }
});

// 01 fully originate
router.get(['/roo/originate/:commodity/:country'], function (req, res) {
    var context = new Context(req);
    var key = req.params["country"] + "";
    if (key == "") {
        key = req.session.data["roo_country"] + "";
    }

    var roo = new Roo(req, key);
    roo.get_content("01-overview");
    res.render('roo/01_originate', {
        'context': context,
        'country': roo
    });
});

// 02 fully obtained
router.get(['/roo/obtained/:commodity/:country'], function (req, res) {
    var context = new Context(req);
    var key = req.params["country"] + "";
    if (key == "") {
        key = req.session.data["roo_country"] + "";
    }

    var roo = new Roo(req, key);
    roo.get_content("02-wholly-obtained");
    res.render('roo/02_obtained', {
        'context': context,
        'country': roo
    });
});

// 03 fully date
router.get(['/roo/date/:commodity/:country'], function (req, res) {
    var context = new Context(req);
    res.render('roo/03_date', {

    });
});


// 04 RoO results
router.get(['/roo/results/:commodity/:country'], function (req, res) {
    var context = new Context(req);
    var key = req.params["country"] + "";
    if (key == "") {
        key = req.session.data["roo_country"] + "";
    }
    var commodity = req.params["commodity"] + "";

    var roo = new Roo(req, key);
    roo.set_commodity(commodity);
    roo.get_rules();
    res.render('roo/04_results', { 'country': roo });
});


// RoO Glossary
router.get(['/roo/glossary'], function (req, res) {
    var context = new Context(req);
    var key = "";
    var roo = new Roo(req, key);
    roo.get_all_abbreviations();
    res.render('roo/glossary', {
        'context': context,
        'country': roo
    });
});

router.get(['/roo/rvc'], function (req, res) {
    var context = new Context(req);
    var key = "";
    var roo = new Roo(req, key);
    roo.get_all_abbreviations("RVC-detail", "Calculating Regional Value Content (RVC)");
    res.render('roo/glossary2', {
        'context': context,
        'country': roo
    });
});



router.get(['/roo/change_country/:commodity'], function (req, res) {
    var context = new Context(req);
    req.session.data["country"] = "";
    var commodity = req.params["commodity"];
    res.redirect('/commodities/' + commodity + "#rules_of_origin");
});

router.get([
    '/roo/select_country/:commodity',
    '/roo/select_country/',
], function (req, res) {
    var context = new Context(req);
    var commodity = req.session.data["commodity"];
    res.redirect('/commodities/' + commodity + "/" + req.session.data["roo_country"] + "#rules_of_origin");
});
/* Rules of origin ends here */


router.get([
    '/roo/clauses/:scheme_code/:markdown_file',
    '/xi/roo/clauses/:scheme_code/:markdown_file',
], function (req, res) {
    var context = new Context(req);
    const path = require('path');
    const fs = require('fs');
    const jp = require('jsonpath');
    const MarkdownIt = require('markdown-it');

    var scheme_code = req.params["scheme_code"];
    var markdown_file = req.params["markdown_file"];

    var filename = process.cwd() + "/app/data/roo/xi/clauses/" + scheme_code + "/" + markdown_file + ".md";
    var content = fs.readFileSync(filename, 'utf8');
    var md = new MarkdownIt();
    content = govify(md.render(content));

    var data = require('../data/roo/xi/roo_schemes.json');
    var schemes = data.schemes;
    country = "JP";
    var query_string = "$[?(@.countries.indexOf('" + country + "') != -1)]"
    var result = jp.query(schemes, query_string);

    var scheme;
    if (result.length > 0) {
        scheme = result[0];
    } else {
        scheme = null;
    }

    res.render('roo/clause.html', {
        'context': context,
        "content": content,
        "scheme": scheme
    });
});

function govify(s) {
    s = s.replace(/<h1/g, "<h1 class='govuk-heading-l'");
    s = s.replace(/<h2/g, "<h2 class='govuk-heading-m'");
    s = s.replace(/<h3/g, "<h3 class='govuk-heading-s'");
    s = s.replace(/<ul/g, "<ul class='govuk-list govuk-list--bullet'");
    s = s.replace(/<ol/g, "<ol class='govuk-list govuk-list--number'");

    s = s.replace(/<h3 class='govuk-heading-s'>([^<]*)<\/h3>/gm, "<h3 class='govuk-heading-s' id='$1'>$1</h3>");

    return (s);
}
/* Rules of origin ends here */


module.exports = router
