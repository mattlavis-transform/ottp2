const e = require('express');
const GeographicalArea = require('./geographical_area');

class Measure {
    constructor(id = null, goods_nomenclature_item_id, req = null, measure_type_id = null, vat = null, measure_class = null) {
        this.id = id;
        this.goods_nomenclature_item_id = goods_nomenclature_item_id;
        this.measure_type_id = measure_type_id;
        this.measure_type_description = null;
        this.measure_class = measure_class;
        this.duty_expression = null;
        this.financial = null;
        this.relevant = false;
        this.measure_components = [];
        this.reduction_indicator = 1;
        this.condition_content_file = "";
        this.condition_content = "";
        this.overwrite_measure_conditions = false;
        this.display_action_column = false;
        this.measure_condition_class = "standard"; // Options are eps, standard // duty, control
        this.has_document_codes = false;
        this.has_duplicate_conditions = false;

        // Get the additional code (for Meursing calcs)
        if (req != null) {
            this.meursing_code = req.session.data["meursing-code"];
        } else {
            this.meursing_code = "";
        }

        // Conditions
        this.measure_condition_ids = [];
        this.measure_conditions = [];
        this.has_conditions = false;
        this.popup_message = "";

        // Footnotes
        this.has_footnotes = false;
        this.footnotes = [];

        // Geography
        this.geographical_area = null;
        this.geographical_area_id = null;
        this.geographical_area_description = null;
        this.additional_code_id = null;
        this.additional_code = null;
        this.additional_code_code = null;
        this.combined_duty = "";
        this.combined_duty_after_meursing = "";
        this.order_number = null;
        this.order_number_id = null;
        this.import = null;
        this.legal_base = "";
        this.legal_acts = [];
        this.legal_act_ids = [];
        this.excluded_country_string = "";
        this.excluded_countries = [];
        this.excluded_country_ids = [];
        this.has_meursing = false;
        this.display_block = "";
        this.duty_bearing = null;
    }

    get_excluded_country_string() {
        var listify = require('listify');
        const eu_countries = [
            'AT',
            'BE',
            'BG',
            'HR',
            'CY',
            'CZ',
            'DK',
            'EE',
            'FI',
            'FR',
            'DE',
            'GR',
            'HU',
            'IE',
            'IT',
            'LV',
            'LT',
            'LU',
            'MT',
            'NL',
            'PL',
            'PT',
            'RO',
            'SK',
            'SI',
            'ES',
            'SE'
        ]
        this.excluded_country_descriptions = [];

        var contains_eu = eu_countries.every(elem => this.excluded_country_ids.includes(elem));

        if (contains_eu) {
            this.excluded_country_descriptions.push("European Union countries");
            this.excluded_countries.forEach(ex => {
                if ((!eu_countries.includes(ex.id)) && (ex.id != "EU")) {
                    this.excluded_country_descriptions.push(ex.description);
                }
            });
        }
        else {
            this.excluded_countries.forEach(ex => {
                this.excluded_country_descriptions.push(ex.description);
            });
        }
        this.excluded_country_string = listify(this.excluded_country_descriptions);
        this.excluded_country_string = this.excluded_country_string.replace(", and", " and");
    }

    combine_duties() {
        this.has_minimum = false;
        this.has_maximum = false;
        this.combined_duty = "";
        this.combined_duty_with_meursing = "";

        // Count the number of clauses in the duty
        // If there are MAX or MIX types, then there are multiple clauses
        this.multi_clause = false;
        this.measure_components.forEach(mc => {
            mc.reduction_indicator = this.reduction_indicator;
            if ((mc.has_maximum) || (mc.has_minimum)) {
                this.multi_clause = true;
            }
        });
        // if (this.multi_clause) {
        //     this.combined_duty = "(";
        // }
        this.measure_components.forEach(mc => {
            if (mc.has_maximum) {
                this.has_maximum = true;
            }
            if (mc.has_minimum) {
                this.has_minimum = true;
            }
            this.combined_duty += mc.duty_string + " ";
            this.combined_duty_with_meursing += mc.duty_string_with_meursing + " ";
            if (mc.is_meursing) {
                this.has_meursing = true;
            }
        });
        this.combined_duty_with_meursing = this.combined_duty_with_meursing.trim();

        this.combined_duty = this.combined_duty.replace(/ \)/g, ")");
        if (this.multi_clause) {
            var a = 1;
        }
    }

    structure_conditions() {
        const fs = require('fs');
        // Get any special measure conditions (for small brewers relief)
        var special_conditions = require('../data/special_conditions.json');

        for (var i = 0; i < special_conditions.length; i++) {
            var sc = special_conditions[i];
            if (this.additional_code == null) {
                if ((sc.additional_code == null) && (this.measure_type_id == sc.measure_type_id) && (this.goods_nomenclature_item_id == sc.goods_nomenclature_item_id)) {
                    this.condition_content_file = sc.content_file;
                    var filename = process.cwd() + "/app/views/conditions/" + this.condition_content_file;
                    this.condition_content = fs.readFileSync(filename, 'utf8');
                    this.overwrite_measure_conditions = sc.overwrite;
                    break;
                }
            } else {
                if ((this.additional_code_code == sc.additional_code) && (this.measure_type_id == sc.measure_type_id) && (this.goods_nomenclature_item_id == sc.goods_nomenclature_item_id)) {
                    this.condition_content_file = sc.content_file;
                    var filename = process.cwd() + "/app/views/conditions/" + this.condition_content_file;
                    this.condition_content = fs.readFileSync(filename, 'utf8');
                    this.overwrite_measure_conditions = sc.overwrite;
                    break;
                }
            }
        }

        var _ = require('lodash');
        this.condition_codes = [];
        this.positive_condition_count = 0;

        // Count the positive conditions and the number of condition codes
        this.measure_conditions.forEach(mc => {
            if (typeof mc.condition_code !== 'undefined') {
                if (mc.positive) {
                    this.positive_condition_count += 1;
                }
                this.condition_codes.push(mc.condition_code);
                var a = 1;
            }
        });

        this.condition_codes = _.uniq(this.condition_codes);
        this.condition_code_count = this.condition_codes.length;

        // intro message on the popup
        this.popup_message = "";
        if (this.measure_condition_class == "eps") {
            this.popup_message += "This commodity is subject to the Entry Price System ('EPS'), which is a variable tariff mechanism applying to certain fruits and vegetables. Under the <abbr title='Entry Price System'>EPS</abbr>, a specific duty is charged in addition to the ad valorem duty, whenever the price at which the goods are imported is below a pre-determined entry price. The specific duty varies depending on the difference between the entry price and the import price of the goods. ";
        }

        if (this.condition_code_count == 1) {
            if (this.positive_condition_count == 1) {
                this.popup_message += "Enter this document code on your declaration.";
            } else {
                this.popup_message += "You will need to meet one of the conditions below on your declaration to comply with this control. Enter the relevant document code on your declaration.";
            }
            this.exposed_conditions = this.measure_conditions;
        } else if (this.condition_code_count > 1) {
            this.popup_message += "Enter the relevant document code on your declaration.";
            this.combine_complex_measures();
        }
    }

    combine_complex_measures() {
        /*
        This is run only when the measure has more than one measure condition code group (MCCG)
        If there is more then one MCCG, then this may indicate that there is some complex
        Boolean logic in play, but this is only the case if one or more of the measure
        conditions' document codes is duplicated across the measure condition groups

        It compresses 'like' positive conditions into single entities, gets rid of negative 
        conditions
        */
        this.exposed_conditions = [];
        this.measure_conditions.forEach(mc => {
            if (mc.positive) {
                var found = false;
                for (var i = 0; i < this.exposed_conditions.length; i++) {
                    var e = this.exposed_conditions[i];
                    if (mc.document_code != "") {
                        if (e.document_code == mc.document_code) {
                            e.instance_count += 1;
                            found = true;
                            break;
                        }
                    }
                }
                if (found == false) {
                    this.exposed_conditions.push(mc);
                }
            }
        });

        this.check_for_duplicate_conditions();
        if (this.has_duplicate_conditions) {
            this.sort_measure_conditions_exposed();
            this.combine_pairs();
        }
    }

    sort_measure_conditions_exposed() {
        this.exposed_conditions.sort(compare_condition_classes);
        this.exposed_conditions.sort(compare_condition_counts);

        function compare_condition_counts(a, b) {
            if (a.instance_count < b.instance_count) {
                return 1;
            }
            if (a.instance_count > b.instance_count) {
                return -1;
            }
            return 0;
        }

        function compare_condition_classes(a, b) {
            if (a.condition_class < b.condition_class) {
                return -1;
            }
            if (a.condition_class > b.condition_class) {
                return 1;
            }
            return 0;
        }
    }

    combine_pairs() {
        if (this.id == 20101211) {
            var a = 1;
        }
        // Build up arrays to represent the horizontal and vertical lists (of 2 groups)
        var found;
        this.condition_codes = [];
        var working_conditions = [];
        this.exposed_conditions.forEach(ec => {
            if (ec.instance_count == 1) {
                found = false;
                if (this.condition_codes.length > 0) {
                    this.condition_codes.forEach(cc => {
                        if (cc.condition_code == ec.condition_code) {
                            cc["conditions"].push(ec);
                            found = true;
                        }
                    });
                    if (!found) {
                        var entity = {
                            "condition_code": ec.condition_code,
                            "conditions": [
                                ec
                            ]
                        }
                        this.condition_codes.push(entity);
                    }
                } else {
                    var entity = {
                        "condition_code": ec.condition_code,
                        "conditions": [
                            ec
                        ]
                    }
                    this.condition_codes.push(entity);
                }
            } else {
                working_conditions.push(ec);
            }
        });

        if (this.condition_codes.length == 2) {
            this.condition_codes[0]["conditions"].forEach(cc0 => {
                this.condition_codes[1]["conditions"].forEach(cc1 => {
                    let tmp = Object.assign(Object.create(Object.getPrototypeOf(cc0)), cc0)
                    tmp.append_condition(cc1);
                    working_conditions.push(tmp);
                });
            });
        }
        this.exposed_conditions = working_conditions;
        var a = 1;

        // var single_pushed = false;
        // this.temp_conditions = this.exposed_conditions;
        // this.exposed_conditions = [];
        // this.temp_conditions.forEach(measure_condition => {
        //     if (measure_condition.instance_count == 2) {
        //         this.exposed_conditions.push(measure_condition);
        //     } else {
        //         if (!single_pushed) {
        //             this.exposed_conditions.push(measure_condition);
        //             single_pushed = true;
        //         } else {
        //             var ln = this.exposed_conditions.length;
        //             var i = 0;
        //             for (i = 0; i < ln; i++) {
        //                 var mc = this.exposed_conditions[i];
        //                 if (this.exposed_conditions[i].instance_count == 1) {
        //                     mc.append_condition(measure_condition);
        //                     break;
        //                 }
        //             }
        //         }
        //     }
        // });
    }



    combine_pairs_safe() {
        if (this.id == 20101211) {
            var a = 1;
        }
        var single_pushed = false;
        this.temp_conditions = this.exposed_conditions;
        this.exposed_conditions = [];
        this.temp_conditions.forEach(measure_condition => {
            if (measure_condition.instance_count == 2) {
                this.exposed_conditions.push(measure_condition);
            } else {
                if (!single_pushed) {
                    this.exposed_conditions.push(measure_condition);
                    single_pushed = true;
                } else {
                    var ln = this.exposed_conditions.length;
                    var i = 0;
                    for (i = 0; i < ln; i++) {
                        var mc = this.exposed_conditions[i];
                        if (this.exposed_conditions[i].instance_count == 1) {
                            mc.append_condition(measure_condition);
                            break;
                        }
                    }
                }
            }
        });
    }

    check_for_duplicate_conditions() {
        this.exposed_conditions.forEach(e => {
            if (e.instance_count > 1) {
                this.has_duplicate_conditions = true;
            }
        });
    }
}
module.exports = Measure