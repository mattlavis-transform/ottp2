const e = require("express");
const axios = require('axios')
const dotenv = require('dotenv');
const config = require('../config.js');
var MarkdownIt = require('markdown-it');
const path = require('path')
const RooMvp = require('../classes/roo_mvp.js');

require('./global.js');

class Context {
    constructor(req, settings_profile = "") {
        this.back_link = req.headers.referer;
        this.title = "";
        this.root_url = "";
        this.source = "";
        this.browse_breadcrumb = "Search or browse the Tariff";
        this.show_stw_furniture = false;
        this.home_banner = "";
        this.settings_profile = settings_profile;
        this.description_class = "";
        this.req = req;
        this.search_term = "";
        this.subdivision = "";

        this.set_profile();
        this.get_root_url(req);
        this.get_scope(req.params["scope_id"]);
        this.get_title(req);
        this.get_banner();
        this.get_date();
        this.get_preferences();
        this.get_location();
        this.get_simulation_date();

        this.show_rosa_version = true;
    }

    set_phase(phase, sub_phase) {
        this.phase = phase;
        this.sub_phase = sub_phase;
        this.get_aside();
    }

    get_aside() {
        this.roo_phases = require('../data/roo/uk/roo_phases.json');
    }

    get_trade_direction(req) {
        this.trade_direction = req.session.data["trade_direction"];

        if ((typeof this.country !== 'undefined') && (this.country !== '') && (this.country !== 'common')) {
            if (this.trade_direction == "import") {
                this.rules_of_origin_title = "Importing commodity COMMODITY from " + this.country_name;
            } else {
                this.rules_of_origin_title = "Exporting commodity COMMODITY to " + this.country_name;
            }

        } else {
            if (this.trade_direction == "import") {
                this.rules_of_origin_title = "Importing commodity COMMODITY";
            } else {
                this.rules_of_origin_title = "Exporting commodity COMMODITY";
            }
        }

        var comm_code = format_and_trim_commodity_code(this.goods_nomenclature_item_id, true);
        this.rules_of_origin_title = this.rules_of_origin_title.replace("COMMODITY", comm_code);
    }

    get_simulation_date() {
        if (typeof this.req.query["as_of"] === 'undefined') {
            this.simulation_date = "";
        } else {
            this.simulation_date = this.req.query["as_of"];
        }
    }

    test_5a() {
        this.guidance_cds = "";
        this.guidance_chief = "";

        var jp = require('jsonpath');
        var data = require('../data/appendix-5a/chief_cds_guidance.json');
        var query_string = '$.document_codes[?(@.code == "' + this.document_code + '")]';
        var query_string = '$.document_codes[?(@.used == "Yes")]';
        var results = jp.query(data, query_string);
        var loop = 0;
        if (results.length > 0) {
            results.forEach(result => {
                var guidance_cds = result.guidance_cds;
                var guidance_chief = result.guidance_chief;

                var md = new MarkdownIt();
                guidance_cds = md.render(guidance_cds);
                guidance_chief = md.render(guidance_chief);

                var status_codes = require('../data/appendix-5a/chief_cds_guidance.json');
                status_codes = status_codes["status_codes"];

                for (const [key, value] of Object.entries(status_codes)) {
                    var find_me = "(" + key + "),";
                    var replace_with = "<abbr title='" + value + "'>$1</abbr>,";
                    var re = new RegExp(find_me, "g");
                    guidance_chief = guidance_chief.replace(re, replace_with);
                    guidance_cds = guidance_cds.replace(re, replace_with);

                    var find_me = "(" + key + ")\</p\>";
                    var replace_with = "<abbr title='" + value + "'>$1</abbr></p>";
                    var re = new RegExp(find_me, "g");
                    guidance_chief = guidance_chief.replace(re, replace_with);
                    guidance_cds = guidance_cds.replace(re, replace_with);

                    var find_me = "(" + key + ")\\*";
                    var replace_with = "<abbr title='" + value + "'>$1</abbr>* ";
                    var re = new RegExp(find_me, "g");
                    guidance_chief = guidance_chief.replace(re, replace_with);
                    guidance_cds = guidance_cds.replace(re, replace_with);

                }

                guidance_cds = guidance_cds.replace(/<ul>/g, "<ul class='govuk-list govuk-list--bullet'>")
                guidance_chief = guidance_chief.replace(/<ul>/g, "<ul class='govuk-list govuk-list--bullet'>")

                guidance_cds = guidance_cds.replace(/&lt;/g, "<")
                guidance_chief = guidance_chief.replace(/&lt;/g, "<")

                guidance_cds = guidance_cds.replace(/&gt;/g, ">")
                guidance_chief = guidance_chief.replace(/&gt;/g, ">")

                if (loop >= 0) {
                    this.guidance_cds += "<h3 class='govuk-heading-s'>CDS " + result.code + "</h3>" + guidance_cds;
                    this.guidance_chief += "<h3 class='govuk-heading-s'>CHIEF " + result.code + "</h3>" + guidance_chief;
                }

                loop += 1;
            });
        }
    }

    get_location() {
        var geoip = require('geoip-country');
        var ip = "207.97.227.239"; // US address
        var ip = "185.86.151.11"; // UK address
        var geo = geoip.lookup(ip);
        this.location = geo.country;
    }

    get_preferences() {
        // Get border system(s)
        this.border_system = this.req.session.data["border_system"] ?? "";
        // this.show_cds = this.border_system.includes("cds");
        // this.show_chief = this.border_system.includes("chief");

        this.show_cds = true;
        this.show_chief = true;

        // Get automatically submit
        this.auto_submit = this.req.session.data["auto_submit"] ?? "yes";
    }

    get_date() {
        var d = new Date();
        this.today = format_date(d, "D MMMM YYYY");
        this.yesterday = format_date(d, "D MMMM YYYY");
    }

    get_commodity(req) {
        this.goods_nomenclature_item_id = req.params["goods_nomenclature_item_id"];
    }

    get_phase(req) {
        this.phase = req.session.data["phase"];
    }

    get_scheme_code(req) {
        var jp = require('jsonpath');
        var data = require('../data/roo/' + this.scope_id_roo + '/roo_schemes_' + this.scope_id_roo + '.json');
        data = data["schemes"];
        this.cumulation_options = [];

        this.features = null;

        if (this.country == "common") {
            this.scheme_code = "common";
            this.scheme_title = "";
            this.ord = "";
            this.original = "";
        } else if ((req.session.data["scheme_code"] != "") && (typeof req.session.data["scheme_code"] !== 'undefined')) {
            this.scheme_code = req.session.data["scheme_code"];
            this.multiple_schemes = true;
            var query_string = "$[?(@.scheme_code == '" + this.scheme_code + "')]"
            this.matching_schemes = jp.query(data, query_string);
            this.scheme_title = this.matching_schemes[0].title;
            this.cumulation_options = this.matching_schemes[0].cumulation;
            this.ord = this.matching_schemes[0].ord;
            this.original = this.matching_schemes[0].original;
            if (typeof this.scheme_ord === 'undefined') {
                this.scheme_ord = "";
            }
            this.features = this.matching_schemes[0].features;
        } else {
            var query_string = "$[?(@.countries.indexOf('" + this.country + "') != -1)]"
            this.matching_schemes = jp.query(data, query_string);
            if (this.matching_schemes.length == 1) {
                this.multiple_schemes = false;
                this.scheme_code = this.matching_schemes[0].scheme_code;
                this.scheme_title = this.matching_schemes[0].title;
                this.cumulation_options = this.matching_schemes[0].cumulation;
                this.ord = this.matching_schemes[0].ord;
                this.original = this.matching_schemes[0].original;
                if (typeof this.scheme_ord === 'undefined') {
                    this.scheme_ord = "";
                }
                try {
                    this.articles = this.matching_schemes[0].articles;
                } catch {
                    this.articles = {}
                }
                this.features = this.matching_schemes[0].features;
            } else {
                this.multiple_schemes = true;
            }
        }
        this.get_psr_file();
    }

    get_roo_origin() {
        if (this.trade_direction == "import") {
            this.roo_origin = this.country_name;
        } else {
            this.roo_origin = "the United Kingdom";
        }
    }

    get_wholly_obtained(req) {
        if (req.session.data["wholly_obtained"] == "yes") {
            this.wholly_obtained = true;
        } else {
            this.wholly_obtained = false;
        }
    }

    get_insufficient_processing(req) {
        if (req.session.data["insufficient_processing"] == "yes") {
            this.insufficient_processing = true;
        } else {
            this.insufficient_processing = false;
        }
    }

    get_rules_met(req) {
        if (req.session.data["psr"] != "not met") {
            // if (req.session.data["met_product_specific_rules"] == "yes") {
            this.met_product_specific_rules = true;
        } else {
            this.met_product_specific_rules = false;
        }
    }

    get_tolerances(req) {
        if (req.session.data["met_tolerances"] == "yes") {
            this.met_tolerances = true;
        } else {
            this.met_tolerances = false;
        }
    }

    get_met_set(req) {
        if (req.session.data["met_set"] == "yes") {
            this.met_set = true;
        } else {
            this.met_set = false;
        }
    }

    get_document(req) {
        this.document = req.params["document"];
        this.document_title = req.params["title"];

        if (this.document != "") {
            var path = process.cwd() + '/app/data/roo/' + this.scope_id_roo + '/articles/' + this.scheme_code + "/" + this.document + '.md';
            var fs = require('fs');
            this.document_content = fs.readFileSync(path, 'utf8');
        } else {
            this.document_content = "";
        }
    }

    reset_subdivision(req) {
        req.session.data["subdivision"] = "";
        this.subdivision = "";
    }

    get_product_specific_rules_json(req, check = "check_all") {
        // 6217100010 on DE = Four subdivisions
        // 5003000010 on DE = Two subdivisions
        // 0702000007 on DE = One subdivision
        this.show_subdivision_selector = false;

        if (check == "check_all") {

            this.subdivision = req.session.data["subdivision"];
            if (typeof this.subdivision === 'undefined') {
                this.subdivision = "";
            }

            if (this.subdivision == "") {
                this.get_subdivisions();
            }
        }
        if (this.show_subdivision_selector == false) {
            this.get_psrs();
        }
    }

    get_psr_file() {
        var filename = this.scheme_code + "_psr.json"
        var path = process.cwd() + '/app/data/roo/' + this.scope_id_roo + '/psr_new/' + filename;
        this.psr_data = require(path);
        var a = 1;
    }

    get_subdivisions(subdivision) {
        const jp = require('jsonpath');
        var query_string = '$.rule_sets[?(@.min <= "' + this.goods_nomenclature_item_id + '" && @.max >= "' + this.goods_nomenclature_item_id + '" && @.valid == true)]';
        var results = jp.query(this.psr_data, query_string);
        this.subdivisions = [];
        if (results.length > 0) {
            results.forEach(heading => {
                if (heading.subdivision.includes("Others")) {
                    this.subdivisions.push("Any other product");
                } else {
                    var tmp = heading.subdivision;
                    tmp = tmp.replace("\n-", ", ");
                    this.subdivisions.push(tmp);
                    var a = 1;
                }
            });
            if (this.subdivisions.length > 1) {
                this.show_subdivision_selector = true;
            } else {
                this.show_subdivision_selector = false;
            }
        }
    }

    get_psrs() {
        const jp = require('jsonpath');
        if (this.subdivision != "") {
            var query_string = '$.rule_sets[?(@.min <= "' + this.goods_nomenclature_item_id + '" && @.max >= "' + this.goods_nomenclature_item_id + '" && @.valid == true && @.subdivision == "' + this.subdivision + '")]';
        } else {
            var query_string = '$.rule_sets[?(@.min <= "' + this.goods_nomenclature_item_id + '" && @.max >= "' + this.goods_nomenclature_item_id + '" && @.valid == true)]';
        }
        var results = jp.query(this.psr_data, query_string);
        this.rule_classes = [];
        if (results.length > 0) {
            var result = results[0];
            this.rules = result.rules;
            this.rules.forEach(rule => {
                if (rule.class.includes("CTSH")) {
                    rule.hint = "This rule is also known as CTSH (change of tariff subheading).<br><a href=''>Find our more about the change of tariff subheading rule</a>";
                } else if (rule.class.includes("CTH")) {
                    rule.hint = "This rule is also known as <a href='#'>CTH (Change of Tariff Heading)</a>.";
                } else if (rule.class.includes("CC")) {
                    rule.hint = "This rule is also known as CC (change of chapter).";
                } else if (rule.class.includes("MaxNOM")) {
                    rule.hint = "The <a href='#'>Maximum Value of Non-Originating Materials (MaxNOM)</a> rule sets a maximum percentage of materials which are not originating in the country of export and can be used within a good that qualifies as originating.";
                } else if (rule.class.includes("RVC")) {
                    rule.hint = "Some words about RVC";
                } else if (rule.class.includes("WO")) {
                    rule.hint = "See the definition of <a href='/roo/wholly_obtained_info/" + this.goods_nomenclature_item_id + "/" + this.country + "'>wholly obtained according to the " + this.scheme_title + "</a>";
                } else if (rule.class.includes("Insufficient processing")) {
                    rule.hint = "The product can include non-originating materials of the same heading. However, processing on these materials does need to go beyond <a href='/roo/insufficient_processing/" + this.goods_nomenclature_item_id + "/" + this.country + "'>insufficient operations</a>.";
                } else {
                    rule.hint = "";
                }
                this.rule_classes = this.rule_classes.concat(rule.class);
            });
        } else {
            this.rules = [];
        }
        if ((this.rule_classes.length == 1) && (this.rule_classes[0] == ['WO'])) {
            this.wholly_obtained_only_rule_applies = true;
        } else {
            this.wholly_obtained_only_rule_applies = false;
        }
        var a = 1;
    }

    async get_product_specific_rules() {
        var axios_response;
        var root = "https://www.trade-tariff.service.gov.uk";
        var url = root + `/api/v2/rules_of_origin_schemes/${this.goods_nomenclature_item_id.substr(0, 6)}/${this.country}`


        this.product_specific_rules = [];
        this.has_cc = false;
        this.has_cth = false;
        this.has_ctsh = false;
        this.has_exw = false;
        this.has_rvc = false;
        this.terms = [];

        [axios_response] = await Promise.all([
            axios.get(url)
        ]);

        var included = axios_response.data["included"];
        included.forEach(item => {
            if (item["type"] == "rules_of_origin_rule") {
                this.product_specific_rules.push(item);
                if (item.attributes.rule.includes("{{WO}}")) {
                    this.terms.push("WO");
                }
                if (item.attributes.rule.includes("{{CC}}")) {
                    this.terms.push("CC");
                }
                if (item.attributes.rule.includes("{{CTH}}")) {
                    this.terms.push("CTH");
                }
                if (item.attributes.rule.includes("{{CTSH}}")) {
                    this.terms.push("CTSH");
                }
                if (item.attributes.rule.includes("RVC")) {
                    this.terms.push("RVC");
                }
                if (item.attributes.rule.includes("{{EXW}}")) {
                    this.terms.push("EXW");
                }
                if (item.attributes.rule.includes("MaxNOM")) {
                    this.terms.push("MaxNOM");
                }
            }
        });
    }

    async get_related_duties() {
        var axios_response;
        var root = "https://www.trade-tariff.service.gov.uk";
        var url = root + `/api/v2/commodities/${this.goods_nomenclature_item_id}?filter[geographical_area_id]=${this.country}`
        // https://www.trade-tariff.service.gov.uk/api/v2/commodities/0208907000?filter[geographical_area_id]=CH
        this.measures = [];

        [axios_response] = await Promise.all([
            axios.get(url)
        ]);

        var included = axios_response.data["included"];

        var mfn_measures = ["103", "105"]
        var preference_measures = ["106", "142", "145"]
        var quota_measures = ["143", "146"]

        this.mfn = "";
        this.preference = null;
        this.quota = null;

        // Get all the duty expressions first
        var duty_expressions = {}
        included.forEach(item => {
            if (item["type"] == "duty_expression") {
                var id = item["id"].replace(/-duty_expression/g, "");
                duty_expressions[id] = item["attributes"]["base"];
                var a = 1;
            }
        });
        included.forEach(item => {
            if (item["type"] == "measure") {
                var measure_type = item["relationships"]["measure_type"]["data"]["id"];
                if (mfn_measures.includes(measure_type)) {
                    this.mfn = duty_expressions[item["id"]];
                }
                if (preference_measures.includes(measure_type)) {
                    this.preference = duty_expressions[item["id"]];
                }
                if (quota_measures.includes(measure_type)) {
                    this.quota = {
                        "ordernumber": item["relationships"]["order_number"]["data"]["id"],
                        "duty": duty_expressions[item["id"]]
                    };
                }
            }
        });

        if ((this.preference != null) || (this.quota != null)) {
            this.has_preferential_rates = true;
        } else {
            this.has_preferential_rates = false;
        }
    }

    get_definitions() {
        this.definitions = {};
        var files = ["WO", "CC", "CTH", "CTSH", "EXW", "RVC", "MaxNOM"];
        files.forEach(file => {
            this.get_definition(file);
        });
    }

    get_definition(file) {
        var path = process.cwd() + '/app/data/roo/definitions/examples/' + file + '.html';
        var fs = require('fs');
        var content = fs.readFileSync(path, 'utf8');
        content = content.replace(/{{ context.goods_nomenclature_item_id }}/g, this.goods_nomenclature_item_id)
        this.definitions[file] = content;
    }

    async get_roo_links() {
        var axios_response;
        var root = "https://www.trade-tariff.service.gov.uk";
        var url = root + `/api/v2/rules_of_origin_schemes/${this.goods_nomenclature_item_id.substr(0, 6)}/${this.country}`

        this.links = [];

        [axios_response] = await Promise.all([
            axios.get(url)
        ]);

        var included = axios_response.data["included"];
        included.forEach(item => {
            if (item["type"] == "rules_of_origin_link") {
                this.links.push(item);
            }
        });
        this.explainers = [
            {
                "title": "xxxDetermining if a good is wholly obtained",
                "file": "wholly-obtained.md"
            },
            {
                "title": "Determining if a product has been sufficiently processed",
                "file": "insufficient-processing.md"
            },
            {
                "title": "Neutral elements",
                "file": "neutral-elements.md"
            },
            {
                "title": "Tolerances",
                "file": "tolerances.md"
            },
            {
                "title": "Sets",
                "file": "sets.md"
            },
            {
                "title": "Verification",
                "file": "verification.md"
            },
            {
                "title": "Cumulation",
                "file": "cumulation.md"
            }
        ]
    }

    async get_proofs() {
        var axios_response;
        var root = "https://www.trade-tariff.service.gov.uk";
        var url = root + `/api/v2/rules_of_origin_schemes/${this.goods_nomenclature_item_id.substr(0, 6)}/${this.country}`

        this.proofs = [];

        [axios_response] = await Promise.all([
            axios.get(url)
        ]);

        var included = axios_response.data["included"];
        included.forEach(item => {
            if (item["type"] == "rules_of_origin_proof") {
                this.proofs.push(item);
            }
        });
    }

    get_article(document_type) {
        const fs = require('fs');

        var path = process.cwd() + "/app/views/roo_new/link_to_original.html";
        var content = fs.readFileSync(path, 'utf8');
        content = content.replace(/\n/gm, "");
        content = content.replace(/\\"/gm, '"');

        var path = process.cwd() + '/app/data/roo/' + this.scope_id_roo + '/articles/' + this.scheme_code + "/" + document_type + '.md';
        try {
            var data = fs.readFileSync(path, 'utf8');

            var phrases = [
                "{{ (Article [0-9]{1,2}) }}",
                "{{ (Articles [0-9]{1,2} and [0-9]{1,2}) }}",
                "{{ (Articles [0-9]{1,2} to [0-9]{1,2}) }}",
                "{{ (Articles [0-9]{1,2} - [0-9]{1,2}) }}"
            ]

            var match_inner, match_outer;
            phrases.forEach(phrase => {
                var replace = "{{ (Article [0-9]{1,2}) }}";
                var regexp = new RegExp(phrase, "");
                var matches = data.match(regexp);
                if (matches) {
                    match_outer = matches[0];
                    match_inner = matches[1];
                }
                // console.log(`Width: ${match[1]} / Height: ${match[2]}.`);
            });

            // content = content.replace(/{{ ARTICLE }}/g, match_inner);
            // content = content.replace(/{{ ORD }}/g, this.ord);
            // content = content.replace(/{{ URL }}/g, "/public/downloads/roo_reference/" + this.original);

            // if (match_outer) {
            //     var regexp = new RegExp(match_outer, "");
            //     data = data.replace(regexp, content);
            // }

            if (match_outer) {
                var regexp = new RegExp(match_outer, "");
                data = data.replace(regexp, "");
            }


            // data = data.replace(/(#{2,3} Wholly obtained products)/g, '$1 according to the ' + this.scheme_title);

            // Legalese
            data = data.replace(/EUR 1/g, "EUR1");
            data = data.replace(/shall/g, "will");
            data = data.replace(/ %/g, "%");

            data = this.replace_article_references(data);

            if (document_type == "wholly-obtained") {
                this.wholly_obtained = data;
            }
            else if (document_type == "wholly-obtained-vessels") {
                this.wholly_obtained_vessels = data;
            }
            else if ((document_type == "originating_import") || (document_type == "originating_export")) {
                this.originating = data;
            }
            else if (document_type == "neutral-elements") {
                this.neutral_elements = data;
            }
            else if (document_type == "accessories") {
                this.accessories = data;
            }
            else if (document_type == "packaging") {
                this.packaging = data;
            }
            else if (document_type == "cumulation-import") {
                this.cumulation = data;
                this.get_cumulation_types();
            }
            else if (document_type == "cumulation-export") {
                this.cumulation = data;
                this.get_cumulation_types();
            }
            else if (document_type == "insufficient-processing") {
                this.insufficient_processing = data;
            }
            else if (document_type == "sufficiently-worked") {
                this.sufficiently_worked = data;
            }
            else if (document_type == "tolerances") {
                this.tolerances = data;
            }
            else if (document_type == "sets") {
                this.sets = data;
            }
            else if (document_type == "verification") {
                this.verification = data;
            }
            else if (document_type == "origin_processes") {
                this.origin_processes = data;
                this.filter_origin_processes();
            }
        } catch {
            console.log("Error getting document " + document_type);
        }
    }

    filter_origin_processes() {
        this.origin_process_titles = [];
        this.origin_process_array = this.origin_processes.split("##");
        this.origin_process_array.shift();
        for (var i = 0; i < this.origin_process_array.length; i++) {
            var tmp = this.origin_process_array[i].split("\n")[0].trim();
            this.origin_process_titles.push(tmp);
            var a = 1;
            this.origin_process_array[i] = "##" + this.origin_process_array[i];
        };
        var a = 1;
    }

    set_origin_index(req) {
        this.origin_index = req.params["index"];
        if (typeof this.origin_index === 'undefined') {
            this.origin_index = 0;
        }
        var a = 1;
    }

    replace_article_references(data) {
        var article_definitions = {
            "general": { "screen": "definitions", "title": "General" },
            "definitions": { "screen": "definitions", "title": "Definitions" },
            "general requirements": { "screen": "origination", "title": "General requirements" },
            "wholly obtained": { "screen": "wholly_obtained_info", "title": "Wholly obtained products" },
            "sufficient working": { "screen": "product_specific_rules", "title": "Sufficient working or processing" },
            "tolerances": { "screen": "tolerances", "title": "Tolerances" },
            "insufficient working": { "screen": "insufficient_processing", "title": "Insufficient working or processing" },
            "cumulation": { "screen": "cumulation", "title": "Cumulation" },
            "cumulation - conditions": { "screen": "cumulation", "title": "Cumulation" },
            "unit of qualification": { "screen": "", "title": "Unit of qualification" },
            "accessories": { "screen": "neutral", "title": "Accessories" },
            "sets": { "screen": "sets", "title": "Sets" },
            "neutral elements": { "screen": "neutral", "title": "Neutral elements" },
            "accounting segregation": { "screen": "", "title": "Accounting segregation" },
            "principle of territoriality": { "screen": "", "title": "Principle of territoriality" },
            "packing materials - shipment": { "screen": "neutral", "title": "Packing materials - shipment" },
            "packing materials - retail": { "screen": "neutral", "title": "Packing materials - retail" },
            "returned products": { "screen": "", "title": "Returned products" },
            "non-alteration": { "screen": "", "title": "Non-alteration" },
            "exhibitions": { "screen": "", "title": "Exhibitions" },
            "direct transport": { "screen": "", "title": "Direct transport" },
            "duty-free": { "screen": "", "title": "Working or processing of materials whose import into the UK is free of duty" },
            "verification": { "screen": "proofs", "title": "Verification" }
        }

        for (const [key, value] of Object.entries(this.articles)) {
            console.log(key, value);
            var regex = new RegExp("(" + key + ")([;:,. \()])", "gi");
            var link = "/roo/" + article_definitions[value]["screen"] + "/" + this.goods_nomenclature_item_id + "/" + this.country;
            var title = article_definitions[value]["title"];
            data = data.replace(regex, "[$1 (" + title + ")](" + link + ")$2");
        }
        return (data);
    }

    safe_get_cumulation_types() {
        this.get_cumulation_texts();
        this.cumulation_types = {
            "bilateral": false,
            "diagonal": false,
            "extended": false,
            "regional": false,
            "full": false,
            "count": 0
        }
        if (this.cumulation.toLowerCase().includes("bilateral cumulation")) {
            this.cumulation_types["bilateral"] = true;
            this.cumulation_types["count"] += 1;
        }
        if (this.cumulation.toLowerCase().includes("extended cumulation")) {
            this.cumulation_types["extended"] = true;
            this.cumulation_types["count"] += 1;
        }
        if (this.cumulation.toLowerCase().includes("diagonal cumulation")) {
            this.cumulation_types["diagonal"] = true;
            this.cumulation_types["count"] += 1;
        }
        var a = 1;
    }



    get_cumulation_types() {
        this.get_cumulation_texts();
        this.cumulation_types = {
            "bilateral": false,
            "diagonal": false,
            "extended": false,
            "regional": false,
            "full": false,
            "count": 0,
            "types": []
        }
        if (this.cumulation_options["bilateral"]["applies"]) {
            this.cumulation_types["bilateral"] = true;
            this.cumulation_types["types"].push("bilateral");
            this.cumulation_types["count"] += 1;
        }
        if (this.cumulation_options["extended"]["applies"]) {
            this.cumulation_types["extended"] = true;
            this.cumulation_types["types"].push("extended");
            this.cumulation_types["count"] += 1;
        }
        if (this.cumulation_options["diagonal"]["applies"]) {
            this.cumulation_types["diagonal"] = true;
            this.cumulation_types["types"].push("diagonal");
            this.cumulation_types["count"] += 1;
        }
        if (this.cumulation_options["full"]["applies"]) {
            this.cumulation_types["full"] = true;
            this.cumulation_types["types"].push("full");
            this.cumulation_types["count"] += 1;
        }
    }

    get_cumulation_texts() {
        this.cumulation_texts = {};
        var path = process.cwd() + '/app/data/roo/' + this.scope_id_roo + '/articles/common/cumulation/';
        var fs = require('fs');
        this.cumulation_texts["bilateral"] = fs.readFileSync(path + "bilateral.md", 'utf8');
        this.cumulation_texts["diagonal"] = fs.readFileSync(path + "diagonal.md", 'utf8');
        this.cumulation_texts["extended"] = fs.readFileSync(path + "extended.md", 'utf8');
    }

    get_country(req) {
        // Get the country (if selected)
        this.country = req.params["country"];
        if (typeof this.country === 'undefined') {
            this.country = req.session.data["country"];
            if (typeof this.country === 'undefined') {
                this.country = "";
            }
        } else {
            req.session.data["country"] = this.country;
        }
        req.session.data["country"] = this.country;

        if (this.country != "") {
            this.get_country_description();
        } else {
            this.country_name = "All countries";
        }
        this.check_gsp();
    }

    check_gsp() {
        var gsp_countries = [
            "AF", "AO", "BD", "BF", "BI", "BJ", "BT", "CD", "CF", "DJ", "ER", "ET", "GM", "GN",
            "GW", "HT", "KH", "KI", "KM", "LA", "LR", "LS", "MG", "ML", "MM", "MR", "MW", "MZ",
            "NE", "NP", "RW", "SB", "SD", "SL", "SN", "SO", "SS", "ST", "TD", "TG", "TL", "TV",
            "TZ", "UG", "VU", "YE", "ZM", "CG", "CK", "DZ", "FM", "GH", "ID", "IN", "JO", "KE",
            "NG", "NU", "SY", "TJ", "VN", "WS", "BO", "CV", "KG", "LK", "MN", "PH", "PK", "UZ"
        ]

        if (gsp_countries.includes(this.country)) {
            this.gsp = true;
        } else {
            this.gsp = false;
        }
    }

    get_country_description(id) {
        var countries = require('../data/countries.json');
        countries.forEach(item => {
            if (item["geographical_area_id"] == this.country) {
                this.country_name = item["description"];
            }
        });
    }

    get_roo_intro_notes(req) {
        var roo = new RooMvp(req, this);
        this.intro_text = roo.intro_text;
    }

    set_profile() {
        switch (this.settings_profile) {
            case "chapters":
                // Field headings
                this.heading_classifier = "Chapter";
                this.heading_description = "Classification";
                // Display options
                this.show_date = true;
                this.show_change_commodity = false;
                this.show_countries = false;
                this.show_date_button = true;
                this.show_supplementary_unit = false;
                break;

            case "headings":
                // Field headings
                this.heading_classifier = "Heading";
                this.heading_description = "Classification";
                // Display options
                this.show_date = true;
                this.show_change_commodity = false;
                this.show_countries = false;
                this.show_date_button = true;
                this.show_supplementary_unit = false;
                break;

            case "subheading":
                // Field headings
                this.heading_classifier = "Code";
                this.heading_description = "Classification";
                // Display options
                this.show_date = true;
                this.show_change_commodity = false;
                this.show_countries = false;
                this.show_date_button = true;
                this.show_supplementary_unit = false;
                break;

            case "commodity":
                // Field headings
                this.heading_classifier = "Commodity";
                this.heading_description = "Classification";
                // Display options
                this.show_date = true;
                this.show_change_commodity = false;
                this.show_countries = true;
                this.show_date_button = true;
                this.show_supplementary_unit = true;
                break;

            default:
                this.heading_classifier = "";
                this.heading_description = "";
                this.show_date = false;
                this.show_change_commodity = false;
                this.show_countries = false;
                this.show_date_button = false;
                this.show_supplementary_unit = false;
                break;
        }
    }

    set_description_class(req) {
        var description_length = this.value_description.length;
        if (description_length > 600) {
            this.description_class = "govuk-summary-list__value--s";
        } else if (description_length > 400) {
            this.description_class = "govuk-summary-list__value--m";
        } else {
            this.description_class = "";
        }
    }

    get_root_url(req) {
        this.host = req.get('host');

        if (this.host.includes("localhost")) {
            this.host = "local";
        } else {
            this.host = "remote";
        }

        var root_url = req.url;
        root_url = root_url.replace("/ni", "/{{ context.scope_id }}");
        root_url = root_url.replace("/gb", "/{{ context.scope_id }}");
        this.root_url = root_url;
    }

    get_scope(s) {
        if ((s == "ni") || (s == "eu") || (s == "xi")) {
            this.scope_id = "xi";
            this.scope_id_roo = "xi";
            this.scope_id_slash = "/xi/";
        } else {
            this.scope_id = "";
            this.scope_id_roo = "uk";
            this.scope_id_slash = "/";
        }
    }

    get_banner() {
        if (this.scope_id == "xi") {
            this.service_name = "The " + config.xiSubServiceName;
            this.home_banner = 'If you&apos;re bringing goods into Northern Ireland from outside the UK and the EU, your import may be subject to EU import duty rates <a href="https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu-from-1-january-2021" class="govuk-link">if your goods are ‘at risk’ of onward movement to the EU</a>. If they are not at risk of onward movement to the EU, use the <a href="/sections">' + config.ukSubServiceName + '</a>.'
        } else {
            this.service_name = "The " + config.ukSubServiceName;
            this.home_banner = 'If you&apos;re bringing goods into Northern Ireland from outside the UK and the EU, you will pay the UK duty rate <a href="https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu-from-1-january-2021">if your goods are not &apos;at risk&apos; of onward movement to the EU</a>. If they are at risk of onward movement to the EU, use the <a href="/xi/find-commodity">' + config.xiSubServiceName + '</a>.'
        }
    }

    get_title(req) {
        if (req.session.data["source"] == "stw") {
            // if (req.cookies["source"] == "stw") {
            this.feedback_url = "https://www.tax.service.gov.uk/contact/beta-feedback?service=STW-CHIEG&backURL=https%3A%2F%2Fcheck-how-to-import-export-goods.service.gov.uk%2Fimport-country-origin";
            this.show_stw_furniture = true;
            if ((this.scope_id == "ni") || (this.scope_id == "xi")) {
                this.title = "Check how to import and export goods";
            } else {
                this.title = "Check how to import and export goods";
            }
            var host = req.get('host');
            if (host.includes("localhost")) {
                this.back_url = "http://localhost:3001/manage-this-trade/calculate-the-tax-and-duty-on-your-goods";
            } else {
                this.back_url = "https://chieg-next.herokuapp.com/manage-this-trade/calculate-the-tax-and-duty-on-your-goods";
            }
        } else {
            this.feedback_url = "https://www.trade-tariff.service.gov.uk/feedback";
            if ((this.scope_id == "ni") || (this.scope_id == "xi")) {
                this.title = "The " + config.xiSubServiceName;
                this.bannerTitle = "Are your goods at risk of onward movement to the EU?";
                this.tab_title_import = "Importing into Northern Ireland";
                this.tab_title_export = "Exporting from Northern Ireland";
            } else {
                this.title = "The " + config.ukSubServiceName;
                this.tab_title_import = "Importing into the UK";
                this.tab_title_export = "Exporting from the UK";
                this.bannerTitle = "Are you importing goods into Northern Ireland?";
            }
            this.back_url = "/duty-calculator/origin/" + req.session.data["goods_nomenclature_item_id"];
        }
        this.title_in_sentence = this.title.substr(0, 1).toLowerCase();
        this.title_in_sentence += this.title.substr(-this.title.length + 1);

        this.serviceName = config.serviceName;
        this.serviceName = this.title;
    }

    get_countries() {
        var countries = require('../data/countries.json');

        countries.sort(function (a, b) {
            if (a.description < b.description) {
                return -1;
            }
            if (a.description > b.description) {
                return 1;
            }
        });
        this.countries = countries;
    }

    get_sort_order() {
        var sort_options = [
            "relevance",
            "alpha"
        ]
        var sort = this.req.query["sort"];
        if ((typeof sort !== 'undefined') && (sort != "")) {
            this.sort_order = sort;
        } else {
            this.sort_order = "relevance";
        }
        if (!sort_options.includes(this.sort_order)) {
            this.sort_order = "relevance";
        }
        // this.sort_order = "alpha";ar 
    }

    get_feature_flags() {
        this.flag_show_new_quota_dialog = this.get_feature_flag("FLAG_SHOW_NEW_QUOTA_DIALOG");
        var a = 1;
    }

    get_feature_flag(flag) {
        var ret;
        try {
            var tmp = process.env[flag];
            if (typeof tmp === 'undefined') {
                ret = 0;
            } else {
                ret = parseInt(tmp);
            }
        } catch {
            ret = 0;
        }
        return (ret)
    }

}
module.exports = Context
