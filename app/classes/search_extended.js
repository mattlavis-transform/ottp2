const axios = require('axios');
const SearchFilter = require('./search_filter');
const Guide = require('./guide');
const SearchHeading = require('./search_heading');
const importFresh = require('import-fresh');
const { result } = require('lodash');

class SearchExtended {
    constructor(context, req, res) {
        this.context = context;
        this.format_search_term();
        this.get_url(req);
        this.sort_order = context.sort_order;

        this.query = importFresh('../queries/query_suggest.json');

        if (this.context.search_term_split.length == 1) {
            this.query.query.bool.must[0].multi_match.query = this.context.search_term;
        } else {
            this.query.query.bool.must[0].multi_match.query = this.context.search_term_split[0];
            for (var i = 0; i < this.context.search_term_split.length - 1; i++) {
                var tmp = JSON.stringify(this.query.query.bool.must[0]);
                var tmp2 = JSON.parse(tmp);
                tmp2.multi_match.query = this.context.search_term_split[i + 1];
                this.query.query.bool.must.push(tmp2);
                // this.query.query.bool.must[i + 1].multi_match.query = this.context.search_term_split[i + 1];
            }
        }
        var t = JSON.stringify(this.query.query.bool.must);
        // console.log(t);

        this.query.suggest.text = this.context.search_term;
        this.guide = null;
        this.guide_minimum_threshold = 1;

        this.get_filters(req);
        // console.log(JSON.stringify(this.query.query));

        var url = 'http://localhost:9200/commodities/_search';
        axios.get(url, {
            params: {
                source: JSON.stringify(this.query),
                source_content_type: 'application/json'
            }
        })
            .then((response) => {
                this.results = response.data.hits;
                this.get_guides(this.results.hits);
                this.get_headings();
                this.process_suggestions(response.data.suggest["did-you-mean"], context.search_term);
                this.deduplicate();
                this.process();

                if (this.sort_order == "alpha") {
                    this.sort_alpha();
                }

                res.render('search/elastic', {
                    'context': this.context,
                    'hits': this.results,
                    'chapters': this.chapter_array,
                    'search_headings': this.search_headings,
                    'suggestions': this.suggestions,
                    'filters': this.filters_with_counts,
                    'applied_filters': this.filter_dict,
                    'guide': this.guide,
                    'heading_style': this.heading_style,
                    'show_chapters': this.show_chapters,
                    'show_headings': this.show_headings,
                    'url': this.url,
                    'conjunction': this.conjunction
                });
            });
    }

    get_url(req) {
        this.url = req.originalUrl;
        if (this.url.includes("?")) {
            this.conjunction = "&";
        } else {
            this.conjunction = "?";
        }
    }

    format_search_term() {
        var sw = require('stopword');

        var temp = this.context.search_term.toLowerCase().replace(/\+/g, " ");
        temp = temp.split(" ");
        temp = sw.removeStopwords(temp);
        this.context.search_term = temp.join(" ");
        this.context.search_term_split = this.context.search_term.split(" ");
    }

    set_tokeniser(req) {
        var item_count = this.context.search_term.split(" ").length;

        if (item_count > 1) {
            this.query.query.bool.must[0].multi_match.analyzer = "english";
            var min_match = Math.max(2, item_count - 1);
            var min_match = item_count;
            this.query.query.bool.must[0].multi_match["minimum_should_match"] = min_match;
        }
    }

    get_headings(req) {
        this.search_headings = [];
        // console.log("Getting headings");
        this.results.hits.forEach(hit => {
            hit = hit._source;
            var new_heading = new SearchHeading(hit);
            var found = false;
            if (new_heading.id.substr(2, 2) != "00") {
                this.search_headings.forEach(existing_heading => {
                    if (new_heading.id == existing_heading.id) {
                        existing_heading.count += 1;
                        found = true;
                    }
                });
                if (!found) {
                    this.search_headings.push(new_heading);
                }
            }
        });

        this.search_headings.sort(compare_headings);

        this.style_search_headings_chapters();

        function compare_headings(a, b) {
            if (a.count > b.count) {
                return -1;
            }
            if (a.count < b.count) {
                return 1;
            }
            return 0;
        }
    }

    style_search_headings_chapters() {
        // Work out how to display headings
        if (this.search_headings.length == 1) {
            this.show_headings = false;
            this.show_chapters = false;
            this.heading_style = "sh4";
        } else if (this.search_headings.length > 12) {
            if (this.chapter_array.length > 1) {
                this.show_chapters = true;
                this.show_headings = false;
            } else {
                this.show_chapters = false;
                this.show_headings = true;
            }
            // this.heading_style = "tabular";
            this.heading_style = "sh4";
        } else if (this.search_headings.length > 8) {
            this.show_chapters = false;
            this.show_headings = true;
            // this.heading_style = "tabular";
            this.heading_style = "sh4";
        } else {
            this.show_chapters = false;
            this.show_headings = true;
            switch (this.search_headings.length) {
                case 1:
                case 2:
                    this.heading_style = "sh2";
                    break;
                case 3:
                case 5:
                case 6:
                case 9:
                    this.heading_style = "sh3";
                    break;
                default:
                    this.heading_style = "sh4";
            }
        }
    }

    get_guides(hits) {
        this.get_guides_by_chapter(hits);
        // this.get_guides_by_keyword();
    }

    get_guides_by_chapter(hits) {
        // console.log("Getting guides by chapter");
        this.chapters = {}
        // Check all the hits and form a unique
        // list of chapters that contain those results, with their frequency
        hits.forEach(hit => {
            var chapter = hit._source.goods_nomenclature_item_id.substr(0, 2);
            var chapter_description = hit._source.chapter;
            if (this.chapters[chapter] === undefined) {
                this.chapters[chapter] = { "count": 1, "description": chapter_description };
            } else {
                this.chapters[chapter]["count"] += 1;
            }
        });

        // Convert this object list into a simple array for sorting
        this.chapter_array = [];
        for (var [key, value] of Object.entries(this.chapters)) {
            var a = 1;
            var obj = [key, value["count"], value["description"]];
            this.chapter_array.push(obj);
        }
        var a = 1;

        // Sort the array with the maximum frequency first
        this.chapter_array.sort(compare_chapter_frequency);

        function compare_chapter_frequency(a, b) {
            if (a[1] > b[1]) {
                return -1;
            }
            if (a[1] < b[1]) {
                return 1;
            }
            return 0;
        }

        const jp = require('jsonpath');
        this.guides = require('../data/guides/guides.json');

        // To show a guide, we need to have at least x percent hits
        // Let's start with x = 25% and try it out
        var match_threshold = 25;

        var guide_found = false;
        this.chapter_array.forEach(chapter => {
            this.guides.guides.forEach(guide => {
                if (!guide_found) {
                    if (guide.chapters !== undefined) {
                        if (guide.chapters.includes(chapter[0])) {
                            if ((chapter[1] / hits.length) * 100 > match_threshold) {
                                this.guide = new Guide(guide);
                                guide_found = true;
                            }
                        }
                    }
                }
            });
        });
    }

    get_guides_by_keyword() {
        // console.log("Getting guides by keyword");
        const jp = require('jsonpath');
        this.guides = require('../data/guides/guides.json');
        var query_string = "$.guides[?(@.terms.indexOf('" + this.context.search_term + "') != -1)]"
        var result = jp.query(this.guides, query_string);
        if (result.length > 0) {
            this.guide = new Guide(result[0]);
        }
        var a = 1;
    }

    get_filters(req) {
        this.filter_list = req.query["filter"];
        this.filter_dict = [];

        if (typeof this.filter_list !== 'undefined') {
            var a = 1;
            for (var [key, value] of Object.entries(this.filter_list)) {
                var filter_field;

                if (key == "chapter") {
                    filter_field = "chapter_id";
                } else if (key == "heading") {
                    filter_field = "heading_id";
                } else {
                    filter_field = key + ".raw";
                }
                var filter_value = value;
                var filter_value_clause = {
                    "query": filter_value
                }
                var filter = {}
                filter.match = {}
                filter.match[filter_field] = filter_value_clause

                var item = {}
                item.field = key;
                item.value = value;
                this.filter_dict.push(item);

                this.query.query.bool.must.push(filter);

            }
        }
    }

    process_suggestions(suggestions, search_term) {
        this.suggestions = [];
        suggestions.forEach(suggestion => {
            suggestion.options.forEach(option => {
                if (option.text != search_term) {
                    this.suggestions.push(option.text);
                }
            });
        });
        var a = 1;
    }

    sort_alpha() {
        this.results.hits.sort(compare_alpha);

        function compare_alpha(a, b) {
            if (a._source.goods_nomenclature_item_id < b._source.goods_nomenclature_item_id) {
                return -1;
            }
            if (a._source.goods_nomenclature_item_id > b._source.goods_nomenclature_item_id) {
                return 1;
            }
            return 0;
        }

    }

    process() {
        this.filters_with_counts = [];
        this.results.hits.forEach(result => {
            for (var [key, value] of Object.entries(result._source)) {
                if (key.includes("filter_")) {
                    var value2 = String(value).toLowerCase();
                    var found = false;
                    this.filters_with_counts.forEach(filter => {
                        if (filter.key == key) {
                            value.forEach(value_instance => {
                                // if (!filter.values.includes(value_instance)) {
                                filter.add_value(value_instance);
                                // }
                            });
                            found = true;
                        }
                    });
                    if (!found) {
                        var new_filter = new SearchFilter(key);
                        value.forEach(value_instance => {
                            new_filter.add_value(value_instance);
                        });
                        this.filters_with_counts.push(new_filter);
                    }
                }
            }
        });

        this.tally_filter_values();
        var a = 1;
    }

    tally_filter_values() {
        this.filters_with_counts.forEach(filter => {
            filter.value_count = 0;
            filter.values.forEach(value => {
                filter.value_count += value.count;
            });
            // filter.sort_values();
        });

        this.filters_with_counts.sort(compare_value_counts);

        function compare_value_counts(a, b) {
            if (a.value_count > b.value_count) {
                return -1;
            }
            if (a.value_count < b.value_count) {
                return 1;
            }
            return 0;
        }
    }

    deduplicate() {
        this.found_commodities = [];
        this.results.hits.forEach(result => {
            result.display = true;
            // if (this.found_commodities.includes(result._source.productline_suffix == "80")) {
            if (result._source.productline_suffix != "80") {
                result.display = true;
            } else {
                if (this.found_commodities.includes(result._source.goods_nomenclature_item_id)) {
                    result.display = false;
                } else {
                    this.found_commodities.push(result._source.goods_nomenclature_item_id);
                    result.display = true;
                }
            }
            var a = 1;
        });
    }

}
module.exports = SearchExtended
