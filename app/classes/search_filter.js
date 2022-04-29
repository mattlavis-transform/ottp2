const SearchFilterEntry = require('./search_filter_entry');

class SearchFilter {
    constructor(key, value = null) {
        var filter_data = require('../data/search/filters.json');
        var instance = filter_data[key.replace("filter_", "")];
        this.key = key;
        this.name = instance.display;
        this.level = instance.level;
        this.values = [];
        if (value != null) {
            this.add_value(value);
        }
    }

    add_value(new_value) {
        var found = false;
        this.values.forEach(value => {
            if (value.value == new_value) {
                found = true;
                value.count += 1;
            }
        });
        if (!found) {
            var search_filter_entry = new SearchFilterEntry(new_value);
            this.values.push(search_filter_entry);
        }
    }

    // sort_values() {
    //     var i;
    //     this.values.sort();
    //     var value_count = this.values.length;
    //     for (i = 0; i < value_count; i++) {
    //         var v = this.values[i];
    //         if (v.value.toLowerCase() == "other") {
    //             var a = 1;
    //             this.values = this.values.filter((n) => { return n.toLowerCase() != "other" });
    //             this.values.push("other");
    //             break;
    //         }
    //     }
    //     var a = 1;
    // }

    sort_values() {
        this.values.sort(compare_filters);

        function compare_filters(a, b) {
            if (a.count > b.count) {
                return -1;
            }
            if (a.count < b.count) {
                return 1;
            }
            return 0;
        }
    }

}
module.exports = SearchFilter
