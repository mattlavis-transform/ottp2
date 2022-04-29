const express = require('express')
const axios = require('axios')
const router = express.Router()
const api_helper = require('./API_helper');
const { response } = require('express');
const Heading = require('./classes/heading.js');
const Commodity = require('./classes/commodity.js');
const Roo = require('./classes/roo.js');
const RooMvp = require('./classes/roo_mvp.js');
const ImportedContext = require('./classes/imported_context.js');
const CPCController = require('./classes/cpc/cpc-controller.js');
const Error_handler = require('./classes/error_handler.js');
const date = require('date-and-time');
const GeographicalArea = require('./classes/geographical_area');
const Link = require('./classes/link');
const Context = require('./classes/context');
const Search = require('./classes/search');
const { xor } = require('lodash');
const Story = require('./classes/story');
const SearchExtended = require('./classes/search_extended');
const SectionChapterNotesCollection = require('./classes/section_chapter_notes_collection');
const CommodityHistory = require('./classes/commodity_history');


require('./classes/global.js');
require('./classes/news.js');
require('./classes/validator.js');
require('dotenv').config();

// Add your routes here - above the module.exports line


/* ############################################################################ */
/* ###################                TEMPORARY               ################# */
/* ############################################################################ */

// Chooser page : will never be used
router.get(['/chooser'], function (req, res) {
    req.cookies["source"] = "ott";
    req.session.data["source"] = "ott";
    var my_story = new Story("uk_long.md").html;
    var context = new Context(req);
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/sections')
        .then((response) => {
            res.render('chooser', {
                'context': context,
                'sections': response.data,
                'story': my_story
            });
        });
});

// Browse sections page
router.get(['/sections/', '/:scope_id/sections'], function (req, res) {
    var context = new Context(req);
    req.cookies["source"] = "ott";
    req.session.data["source"] = "ott";
    if (context.scope_id == "xi") {
        res.redirect("/xi/find-commodity")
    } else {
        res.redirect("/find-commodity")
    }
});

// Browse sections page
router.get(['/browse/', '/:scope_id/browse'], function (req, res) {
    req.cookies["source"] = "ott";
    req.session.data["source"] = "ott";
    var my_story = new Story("uk_long.md").html;
    var context = new Context(req);
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/sections')
        .then((response) => {
            res.render('browse', {
                'context': context,
                'sections': response.data,
                'story': my_story
            });
        });
});

// Search page
router.get(['/find-commodity/', '/:scope_id/find-commodity'], function (req, res) {
    req.cookies["source"] = "ott";
    req.session.data["source"] = "ott";
    var my_story = new Story("uk_long.md").html;
    var context = new Context(req);
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/sections')
        .then((response) => {
            res.render('find-commodity', {
                'context': context,
                'sections': response.data,
                'story': my_story
            });
        });
});

// Browse within a section
router.get(['/:scope_id/sections/:sectionId', '/sections/:sectionId'], function (req, res) {
    var context = new Context(req);
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/sections/' + req.params["sectionId"])
        .then((response) => {
            res.render('section', {
                'context': context,
                'section': response.data
            });
        });
});

// Browse within a chapter
router.get(['/chapters/:chapterId', '/:scope_id/chapters/:chapterId'], function (req, res) {
    var context = new Context(req, "chapters");
    var chapter_id = req.params["chapterId"];
    chapter_id = chapter_id.padStart(2, "0");
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/chapters/' + chapter_id)
        .then((response) => {
            var chapter = response.data;
            context.value_classifier = chapter.data.attributes.goods_nomenclature_item_id.substr(0, 2);
            context.value_description = chapter.data.attributes.formatted_description;
            context.set_description_class()
            res.render('chapters', {
                'context': context,
                'chapter': chapter
            });
        });
});

// Browse within a heading
router.get(['/headings/:headingId', '/:scope_id/headings/:headingId'], async function (req, res) {
    var context = new Context(req, "headings");
    var heading_id = req.params["headingId"];
    var url = 'https://www.trade-tariff.service.gov.uk/api/v2/headings/' + heading_id;
    if (context.simulation_date != "") {
        if (url.includes("?")) {
            url += "&";
        } else {
            url += "?";
        }
        url += "as_of=" + context.simulation_date;
    }

    const axiosrequest1 = axios.get(url);
    try {
        await axios.all([axiosrequest1]).then(axios.spread(function (response) {
            h = new Heading(response.data);
            if (h.data.attributes.declarable) {
                var url = "/commodities/" + heading_id + "000000";
                res.redirect(url);
            } else {
                // Get a record count of declarable codes
                h.leaf_count = 0;
                h.included.forEach(item => {
                    if (item.type == "commodity") {
                        if (item.attributes.leaf) {
                            h.leaf_count += 1;
                        }
                    }
                });

                context.value_classifier = h.data.attributes.goods_nomenclature_item_id.substr(0, 4);
                context.value_description = h.data.attributes.formatted_description;
                context.set_description_class()
                res.render('headings', {
                    'context': context,
                    'heading': h
                });
            }
        }));
    }
    catch (error) {
        var url = "/commodity_history/" + heading_id; //.padEnd(10, '0');
        if (context.simulation_date != "") {
            url += "?as_of=" + context.simulation_date
        }
        res.redirect(url);
    }


});


// Browse a subheading (lower than a heading, but not an end-line)
// Example would be 38089490, which has 3808949010 and 3808949090 as end-line child codes

router.get([
    '/subheadings/:goods_nomenclature_item_id',
    '/:scope_id/subheadings/:goods_nomenclature_item_id',
    '/subheadings/:goods_nomenclature_item_id/:search_term',
    '/:scope_id/subheadings/:goods_nomenclature_item_id/:search_term'
], function (req, res) {
    var goods_nomenclature_item_id = req.params["goods_nomenclature_item_id"];
    if (goods_nomenclature_item_id.length == 4) {
        res.redirect("/headings/" + goods_nomenclature_item_id);
    } else {
        var context = new Context(req, "subheading");
        context.search_term = req.params["search_term"];
        axios.get('https://www.trade-tariff.service.gov.uk/api/v2/headings/' + goods_nomenclature_item_id.substr(0, 4))
            .then((response) => {
                h = new Heading(response.data, goods_nomenclature_item_id);
                if (h.data.attributes.declarable) {
                    var url = "/commodities/" + heading_id + "000000";
                    res.redirect(url);
                } else {
                    context.value_classifier = goods_nomenclature_item_id.padEnd(10, '0');
                    context.value_description = "Test"; // h.data.attributes.formatted_description;
                    context.set_description_class()
                    res.render('subheading', {
                        'context': context,
                        'heading': h,
                        'goods_nomenclature_item_id': goods_nomenclature_item_id.padEnd(10, '0')
                    });
                }
            });
    }
});


// Browse a single commodity
router.get([
    '/commodities/:goods_nomenclature_item_id/',
    '/commodities/:goods_nomenclature_item_id/:country',
    '/:scope_id/commodities/:goods_nomenclature_item_id',
    '/:scope_id/commodities/:goods_nomenclature_item_id/:country',
], async function (req, res) {
    var context = new Context(req, "commodity");
    var countries = global.get_countries(req.session.data["country"]);
    var date = global.get_date(req);
    context.get_country(req);

    // Get any RoO information that we can
    roo_mvp = new RooMvp(req, context);

    if (req.session.data["border_system"] == "chief") {
        border_system = "chief";
        toggle_message = {
            "declaration_th": "Declaration instructions for CHIEF",
            "toggle_text": "Show CDS instructions instead",
            "border_system": "CHIEF",
            "cds_class": "hidden",
            "chief_class": ""
        }
    } else {
        border_system = "cds";
        toggle_message = {
            "declaration_th": "Declaration instructions for CDS",
            "toggle_text": "Show CHIEF instructions instead",
            "border_system": "CDS",
            "cds_class": "",
            "chief_class": "hidden"
        }
    }

    var c;
    req.session.data["goods_nomenclature_item_id"] = req.params["goods_nomenclature_item_id"];
    req.session.data["error"] = "";
    var url_original;
    if (context.country == null) {
        var url = 'https://www.trade-tariff.service.gov.uk/api/v2/commodities/' + req.params["goods_nomenclature_item_id"];
    } else {
        var url = 'https://www.trade-tariff.service.gov.uk/api/v2/commodities/' + req.params["goods_nomenclature_item_id"] + "?filter[geographical_area_id]=" + context.country;
    }
    if (context.simulation_date != "") {
        if (url.includes("?")) {
            url += "&";
        } else {
            url += "?";
        }
        url += "as_of=" + context.simulation_date;
    }
    // context.simulation_date = "";
    if ((context.scope_id == "ni") || (context.scope_id == "xi")) {
        // Northern Ireland
        url_original = url;
        url = url.replace("/api", "/xi/api");
        const axiosrequest1 = axios.get(url);
        const axiosrequest2 = axios.get(url_original);
        await axios.all([axiosrequest1, axiosrequest2]).then(axios.spread(function (res1, res2) {
            // Get the EU measures
            c = new Commodity();
            c.country = context.country;
            c.pass_request(req);
            c.get_data(res1.data);
            c.get_measure_data(req, "basic");

            context.value_classifier = c.data.attributes.goods_nomenclature_item_id;
            context.value_description = c.commodity_description_trail;
            context.set_description_class()

            // Append the UK measures
            c_uk = new Commodity();
            c_uk.country = context.country;
            c_uk.pass_request(req);
            c_uk.get_data(res2.data);
            c_uk.get_measure_data(req, "basic", override_block = true);

            c_uk.measures.forEach(m => {
                if (m.block == "other_uk") {
                    c.measures.push(m);
                }
            });

            c.categorise_measures(override_block = "smart");
            c.sort_measures();

            res.render('commodities', {
                'context': context,
                'roo': roo_mvp,
                'date': date,
                'countries': countries,
                'toggle_message': toggle_message,
                'commodity': c
            });
        }));

    } else {
        // UK
        const axiosrequest1 = axios.get(url);
        // try {
            await axios.all([axiosrequest1]).then(axios.spread(function (response) {
                c = new Commodity();
                c.country = context.country;
                c.pass_request(req);
                c.get_data(response.data);
                c.get_measure_data(req, "basic");

                context.value_classifier = c.data.attributes.goods_nomenclature_item_id;
                context.value_description = c.description;
                context.set_description_class()

                c.sort_measures();

                context.show_chief = true;
                context.show_cds = true;

                res.render('commodities', {
                    'context': context,
                    'date': date,
                    'countries': countries,
                    'roo': roo_mvp,
                    'toggle_message': toggle_message,
                    'commodity': c
                });
            }));
        // }
        // catch (error) {
        //     var url = "/commodity_history/" + req.params["goods_nomenclature_item_id"];
        //     if (context.simulation_date != "") {
        //         url += "?as_of=" + context.simulation_date
        //     }
        //     res.redirect(url);
        // }
    }
});

// Reset country
router.get(['/country_reset/:goods_nomenclature_item_id/'], function (req, res) {
    req.session.data["country"] = "";
    res.redirect("/commodities/" + req.params["goods_nomenclature_item_id"]);
});

// Get a geographical area
router.get(['/geographical_area/:id/', '/:scope_id/geographical_area/:id/',], function (req, res) {
    var id = req.params["id"];
    var context = new Context(req);
    var referer = req.headers.referer;
    if (referer == null) {
        referer = "/";
    }
    var url = 'https://www.trade-tariff.service.gov.uk/api/v2/geographical_areas/';
    if ((context.scope_id == "ni") || (context.scope_id == "xi")) {
        url = url.replace("/api", "/xi/api");
    }
    axios.get(url)
        .then((response) => {
            g = global.get_geography(id, response.data);
            res.render('geographical_area', {
                'context': context,
                'referer': referer,
                'geographical_area': g
            });
        });
});



// Get a measure types
router.get(['/measure_type/:id/', '/:scope_id/measure_type/:id/',], function (req, res) {
    var id = req.params["id"];
    var context = new Context(req);
    var referer = req.headers.referer;
    if (referer == null) {
        referer = "/";
    }
    var url = 'https://www.trade-tariff.service.gov.uk/api/v2/measure_types/';
    if ((context.scope_id == "ni") || (context.scope_id == "xi")) {
        url = url.replace("/api", "/xi/api");
    }
    axios.get(url)
        .then((response) => {
            mt = global.get_measure_type(id, response.data);
            res.render('measure_type', {
                'context': context,
                'referer': referer,
                'measure_type': mt
            });
        });
});


// Test all 5a content
router.get(['/test_5a',], function (req, res) {
    var context = new Context(req);
    context.test_5a();
    var referer = req.headers.referer;
    if (referer == null) {
        referer = "/";
    }
    res.render('test_5a', {
        'context': context,
        'referer': referer
    });
});

/* ############################################################################ */
/* ###################                END BROWSE              ################# */
/* ############################################################################ */


/* ############################################################################ */
/* ###################              BEGIN SEARCH              ################# */
/* ############################################################################ */

// Search page
router.get(['/search/:scope_id', '/search/', '/search//'], function (req, res) {
    var context = new Context(req);
    axios.get('https://www.trade-tariff.service.gov.uk/api/v2/sections')
        .then((response) => {
            res.render('search', {
                'context': context,
                'sections': response.data
            });
        });
});



// Search results / data handler
router.post(['/search/data_handler/', '/:scope_id/search/data_handler/:goods_nomenclature_item_id'], function (req, res) {
    var search_term = req.session.data["search"].trim().replace(" ", "");
    if (search_term.length == 10) {
        res.redirect("/commodities/" + search_term);
    } else {
        res.redirect("/search/");
    }
});
/* ############################################################################ */
/* ###################               END SEARCH               ################# */
/* ############################################################################ */


/* ############################################################################ */
/* ###################       BEGIN SUBSIDIARY NAVIGATION      ################# */
/* ############################################################################ */

// A-Z index
router.get(['/a-z-index/:letter', '/:scope_id/a-z-index/:letter'], function (req, res) {
    var context = new Context(req);
    var url = 'https://www.trade-tariff.service.gov.uk/api/v2/search_references.json?query[letter]=' + req.params["letter"];
    axios.get(url)
        .then((response) => {
            res.render('a-z-index', {
                'context': context,
                'headings': response.data,
                'letter': req.params["letter"]
            });
        });
});

// Downloads
router.get(['/downloads/', '/:scope_id/downloads'], function (req, res) {
    var context = new Context(req);
    res.render('downloads', {
        'context': context
    });
});

// News
router.get(['/news/', '/:scope_id/news'], function (req, res) {
    var context = new Context(req);
    news = global.get_news();
    res.render('news', {
        'context': context,
        'news': news
    });
});

// Preferences
router.get([
    '/preferences/',
    ':scope_id/preferences/',
    '/preferences/:confirm',
    ':scope_id/preferences/:confirm'
], function (req, res) {
    var context = new Context(req);
    var show_confirmation = req.params["confirm"];
    res.render('preferences', {
        'context': context,
        'show_confirmation': show_confirmation,
        'scope_id': scope_id,
        'root_url': root_url,
        'title': title
    });
});


/* ############################################################################ */
/* ###################        END SUBSIDIARY NAVIGATION       ################# */
/* ############################################################################ */


// Help
router.get(['/help/undefined'], function (req, res) {
    res.redirect('/help');
});

router.get(['/help'], function (req, res) {
    //const now = new Date('2021/05/06 14:14:05');
    const now = new Date();
    var show_webchat = isWorkingHour(now);
    var context = new Context(req);
    var key = "";
    var roo = new RooMvp(req, key, context.scope_id);
    roo.get_all_abbreviations();

    res.render('help/index', {
        'context': context,
        "show_webchat": show_webchat,
        'roo': roo
    });

    function isWorkingHour(now) {
        return now.getDay() <= 4 && now.getHours() >= 9 && now.getHours() < 17;
    }
});

router.get(['/help/cn2021-cn2022'], function (req, res) {
    //const now = new Date('2021/05/06 14:14:05');
    var context = new Context(req);
    res.render('help/cn2021-cn2022', {
        'context': context
    });
});

router.get(['/help/how-to-use'], function (req, res) {
    var context = new Context(req);
    res.render('help/how-to-use', {
        'context': context
    });
});


// Search
router.get(['/search_handler'], function (req, res) {
    var url = "";
    var search_term = req.query["search_term"];
    res.redirect("/results/" + search_term);
});

// Search results
router.get([
    '/results/:search_term',
], async function (req, res) {
    var context = new Context(req);
    var search_term = req.params["search_term"];

    // Make first request
    var axios_response;
    var call_type = "search";
    var url = "https://www.trade-tariff.service.gov.uk/search.json?q=" + search_term + "&input-autocomplete=" + search_term;
    [axios_response] = await Promise.all([
        axios.get(url)
    ]);

    // Then if necessary the second, which is just a heading
    var results = axios_response.data.results;
    if (results.length == 1) {
        if (results[0].type == "heading") {
            call_type = "heading";
            var key = results[0].goods_nomenclature_item_id.substring(0, 4);
            var url = "/headings/" + key;
            res.redirect(url);
            return;
        } else if (results[0].type == "chapter") {
            call_type = "chapter";
            var url = "/chapters/" + results[0].goods_nomenclature_item_id.substring(0, 2) + "/" + term;
            res.redirect(url);
            return;
        }
    }

    var search = new Search(axios_response.data, call_type);
    var search_context = {}
    search_context.call_type = call_type;
    search_context.links = search.links;
    search_context.search = search;
    search_context.heading_count = search.heading_count;
    search_context.commodity_count = search.commodity_count;
    res.render('search-results', {
        'context': context,
        'search_context': search_context,
        'term': search_term
    });


});

// Change the date
router.get(['/change-date'], function (req, res) {
    var date = global.get_date(req, save = true);
    let goods_nomenclature_item_id = req.query["goods_nomenclature_item_id"];
    var url = "/commodities/${goods_nomenclature_item_id}?day=${day}&month=${month}&year=${year}";
    url = url.replace("${goods_nomenclature_item_id}", goods_nomenclature_item_id);
    url = url.replace("${day}", date.day);
    url = url.replace("${month}", date.month);
    url = url.replace("${year}", date.year);
    res.redirect(url);
});

/* ############################################################################ */
/* ###################               FURNITURE                ################# */
/* ############################################################################ */

// Cookies page
router.get(['/:scope_id/cookies', '/cookies/'], function (req, res) {
    var context = new Context(req);
    res.render('cookies', {
        'context': context
    });
});


/* ############################################################################ */
/* ###################          NEW ACCESSIBLE PICKERS        ################# */
/* ############################################################################ */

router.get(['/:scope_id/date', '/date/'], function (req, res) {
    var context = new Context(req);
    res.render('date', {
        'context': context
    });
});
router.get(['/:scope_id/country/:goods_nomenclature_item_id', '/country/:goods_nomenclature_item_id'], function (req, res) {
    var context = new Context(req);
    context.goods_nomenclature_item_id = req.params["goods_nomenclature_item_id"];
    context.get_countries();
    res.render('set-country-filter', {
        'context': context,
    });
});

// Set the country filter for comm codes
router.get(['/country-filter'], async function (req, res) {
    var goods_nomenclature_item_id = req.session.data["goods_nomenclature_item_id"];
    var country = req.query["country"];
    var tab = req.cookies["tab"];
    var context = new Context(req);

    var url = "/commodities/" + goods_nomenclature_item_id + "/" + country;
    if ((context.scope_id == "ni") || (context.scope_id == "xi")) {
        url = url.replace("/commodities/", "xi/commodities/");
    }
    if (typeof tab === 'undefined') {
        tab = ""
    } else {
        url += "#" + tab;
    }
    res.redirect(url);
});

// Elastic search
router.get(['/elastic/:search_term'], function (req, res) {
    var context = new Context(req);
    context.get_sort_order();
    context.search_term = req.params["search_term"];
    if (context.search_term != "") {
        var search = new SearchExtended(context, req, res)
    }
});

// Elastic search (using querystring)
router.get(['/elastic/'], function (req, res) {
    var search_term = req.query["search_term"];
    var url = "/elastic/" + search_term;
    res.redirect(url);
});

// Used for testing section and chapter notes
router.get(['/notes'], function (req, res) {
    var context = new Context(req);
    var section_chapter_notes_collection = new SectionChapterNotesCollection()
    res.render('section_chapter_notes', {
        'context': context,
        'section_chapter_notes_collection': section_chapter_notes_collection
    });
});


// Comm code history
router.get(['/commodity_history/:commodity_code'], function (req, res) {
    var a = process.env.USER_ID;
    var context = new Context(req);
    var commodity_code = req.params["commodity_code"];
    if (commodity_code.length == 4) {
        context.resource_type = "heading";
    } else {
        context.resource_type = "commodity";
    }
    commodity_code = req.params["commodity_code"].padEnd(10, '0');
    var commodity_history = new CommodityHistory(context, req, res, commodity_code)
});

module.exports = router