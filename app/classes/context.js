const e = require("express");
const axios = require('axios')
const dotenv = require('dotenv');
const config = require('../config.js');
var MarkdownIt = require('markdown-it');
const path = require('path')
const RooMvp = require('../classes/roo_mvp.js');

class Context {
    constructor(req, settings_profile = "") {
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

        this.rules_of_origin_title = this.rules_of_origin_title.replace("COMMODITY", this.goods_nomenclature_item_id);
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
        var a = 1;
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

    get_scheme_code() {
        if (this.country == "common") {
            this.scheme_code = "common";
            this.scheme_title = "";
        } else {
            var jp = require('jsonpath');
            var data = require('../data/roo/' + this.scope_id_roo + '/roo_schemes_' + this.scope_id_roo + '.json');
            data = data["schemes"];
            var query_string = "$[?(@.countries.indexOf('" + this.country + "') != -1)]"
            this.matching_schemes = jp.query(data, query_string);
            if (this.matching_schemes.length == 1) {
                this.scheme_code = this.matching_schemes[0].scheme_code;
                this.scheme_title = this.matching_schemes[0].title;
            } else {
                var a = 1; // There is either no match or there is more than one match
            }
        }

    }

    get_roo_origin() {
        if (this.trade_direction == "import") {
            this.roo_origin = this.country_name
        } else {
            this.roo_origin = "the United Kingdom"
        }
    }

    get_wholly_obtained(req) {
        if (req.session.data["wholly_obtained"] == "yes") {
            this.wholly_obtained = true;
        } else {
            this.wholly_obtained = false;
        }
    }

    get_sufficiently_processed(req) {
        if (req.session.data["sufficiently_processed"] == "yes") {
            this.sufficiently_processed = true;
        } else {
            this.sufficiently_processed = false;
        }
    }

    get_rules_met(req) {
        if (req.session.data["met_product_specific_rules"] == "yes") {
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
            // var data = fs.readFileSync(path, 'utf8');
            // var md = new MarkdownIt();
            // this.document_content = md.render(data);
            this.document_content = fs.readFileSync(path, 'utf8');
        } else {
            this.document_content = "";
        }
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
        var a = 1;
        this.explainers = [
            {
                "title": "Determining if a good is wholly obtained",
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
        var a = 1;
    }

    get_article(document_type) {
        var path = process.cwd() + '/app/data/roo/' + this.scope_id_roo + '/articles/' + this.scheme_code + "/" + document_type + '.md';
        var fs = require('fs');
        var data = fs.readFileSync(path, 'utf8');
        if (document_type == "wholly-obtained") {
            this.wholly_obtained = data;
        }
        else if (document_type == "neutral-elements") {
            this.neutral_elements = data;
        }
        else if (document_type == "cumulation") {
            this.cumulation = data;
        }
        else if (document_type == "insufficient-processing") {
            this.insufficient_processing = data;
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
        // var a = 1;
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
        var a = 1;
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

            case "intermediate":
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
        var a = 1;
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
    }

}
module.exports = Context
