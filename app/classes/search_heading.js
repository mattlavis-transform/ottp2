class SearchHeading {
    constructor(hit) {
        this.id = hit.goods_nomenclature_item_id.substr(0, 4);
        this.description = hit.heading;
        this.description_full = this.description;
        this.count = 1;

        this.format_description();
    }

    format_description() {
        var ellipsize = require('ellipsize');
        this.description = ellipsize(this.description, 150);
    }
}
module.exports = SearchHeading