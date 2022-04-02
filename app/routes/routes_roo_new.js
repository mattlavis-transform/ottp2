const express = require('express')
const axios = require('axios')
const router = express.Router()
const api_helper = require('../API_helper');
const { response } = require('express');
const Heading = require('../classes/heading.js');
const Commodity = require('../classes/commodity.js');
const ImportedContext = require('../classes/imported_context.js');
const Error_handler = require('../classes/error_handler.js');
const date = require('date-and-time');
const GeographicalArea = require('../classes/geographical_area');
const Link = require('../classes/link');
const Context = require('../classes/context');
const { xor } = require('lodash');

require('../classes/global.js');
require('../classes/news.js');
require('../classes/validator.js');

// Add your routes here - above the module.exports line

const asyncMiddleware = fn =>
    (req, res, next) => {
        Promise.resolve(fn(req, res, next))
            .catch(next);
    };


// Data handler
router.get(['/roo/data_handler/:goods_nomenclature_item_id/:country/', 'xi/roo/data_handler/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    var url;
    context.get_scope();
    context.get_country(req);
    context.get_commodity(req);
    context.get_phase(req)

    if (context.phase == "wholly_obtained") {
        context.get_sufficiently_processed(req);
        if (context.sufficiently_processed) {
            url = "/roo/product_specific_rules/" + context.goods_nomenclature_item_id + "/" + context.country;
        } else {
            url = "/roo/not_met/" + context.goods_nomenclature_item_id + "/" + context.country;
        }
    } else if (context.phase == "processing") {
        context.get_sufficiently_processed(req);
        if (context.sufficiently_processed) {
            url = "/roo/product_specific_rules/" + context.goods_nomenclature_item_id + "/" + context.country;
        } else {
            url = "/roo/not_met/" + context.goods_nomenclature_item_id + "/" + context.country;
        }
    } else if (context.phase == "product_specific_rules") {
        context.get_rules_met(req);
        if (context.met_product_specific_rules) {
            url = "/roo/proofs/" + context.goods_nomenclature_item_id + "/" + context.country;
        } else {
            url = "/roo/tolerances/" + context.goods_nomenclature_item_id + "/" + context.country;
        }
    } else if (context.phase == "tolerances") {
        context.get_tolerances(req);
        if (context.met_tolerances) {
            url = "/roo/proofs/" + context.goods_nomenclature_item_id + "/" + context.country;
        } else {
            url = "/roo/sets/" + context.goods_nomenclature_item_id + "/" + context.country;
        }
    } else if (context.phase == "sets") {
        context.get_met_set(req);
        if (context.met_set) {
            url = "/roo/proofs/" + context.goods_nomenclature_item_id + "/" + context.country;
        } else {
            url = "/roo/not_met/" + context.goods_nomenclature_item_id + "/" + context.country;
        }
    }

    res.redirect(url);
});

// 01 Trade Direction
router.get(['/roo/trade_direction/:goods_nomenclature_item_id/:country/', 'xi/roo/trade_direction/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var phase = req.session.data["phase"];
    var context = new Context(req, "commodity");
    context.get_scope();
    context.get_country(req);
    context.get_commodity(req);

    res.render('roo_new/01_trade_direction', {
        'context': context
    });
});

// 02 Origination
router.get(['/roo/origination/:goods_nomenclature_item_id/:country/', 'xi/roo/origination/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    if (context.trade_direction == "import") {
        context.get_article("originating_import");
    } else {
        context.get_article("originating_export");
    }

    res.render('roo_new/02_originate', {
        'context': context
    });
});

// 03 Wholly obtained
router.get(['/roo/wholly_obtained/:goods_nomenclature_item_id/:country/', 'xi/roo/wholly_obtained/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    context.get_article("wholly-obtained")
    context.get_article("neutral-elements")

    res.render('roo_new/03_wholly_obtained', {
        'context': context
    });
});

// 03 Processing
router.get(['/roo/processing/:goods_nomenclature_item_id/:country/', 'xi/roo/processing/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    context.get_article("insufficient-processing")
    context.get_article("cumulation")

    res.render('roo_new/04_processing', {
        'context': context
    });
});

// 04 Product-specific rules
router.get(
    ['/roo/product_specific_rules/:goods_nomenclature_item_id/:country/',
        'xi/roo/processing/:goods_nomenclature_item_id/:country/'],
    asyncMiddleware(async (req, res, next) => {
        var context = new Context(req, "commodity");
        context.get_country(req);
        context.get_commodity(req);
        context.get_trade_direction(req);
        context.get_scope();
        context.get_roo_origin(req);
        context.get_scheme_code();
        context.get_definitions();
        context.get_roo_intro_notes(req);
        await context.get_product_specific_rules();

        res.render('roo_new/05_product_specific_rules', {
            'context': context
        });
    }));


// 05 Tolerances
router.get(['/roo/tolerances/:goods_nomenclature_item_id/:country/', 'xi/roo/tolerances/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    context.get_article("tolerances")

    res.render('roo_new/06_tolerances', {
        'context': context
    });
});

// 06 Sets
router.get(['/roo/sets/:goods_nomenclature_item_id/:country/', 'xi/roo/tolerances/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    context.get_article("sets")

    res.render('roo_new/07_sets', {
        'context': context
    });
});


// Proofs
router.get(['/roo/proofs/:goods_nomenclature_item_id/:country/', 'xi/roo/processing/:goods_nomenclature_item_id/:country/'],
    asyncMiddleware(async (req, res, next) => {
        var context = new Context(req, "commodity");
        context.get_country(req);
        context.get_commodity(req);
        context.get_trade_direction(req);
        context.get_scope();
        context.get_roo_origin(req);
        context.get_scheme_code();
        await context.get_proofs();
        await context.get_roo_links();
        context.get_article("verification")

        res.render('roo_new/98_proofs', {
            'context': context
        });
    }));


// Not met
router.get(['/roo/not_met/:goods_nomenclature_item_id/:country/', 'xi/roo/processing/:goods_nomenclature_item_id/:country/'], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();

    res.render('roo_new/99_not_met', {
        'context': context
    });
});

// Document
router.get([
    '/roo/document/:goods_nomenclature_item_id/:country/:document/:title/',
    'xi/roo/processing/:goods_nomenclature_item_id/:country/:document/:title/'
], function (req, res) {
    var context = new Context(req, "commodity");
    context.get_country(req);
    context.get_commodity(req);
    context.get_trade_direction(req);
    context.get_scope();
    context.get_roo_origin(req);
    context.get_scheme_code();
    context.get_document(req);

    res.render('roo_new/99_document', {
        'context': context
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
