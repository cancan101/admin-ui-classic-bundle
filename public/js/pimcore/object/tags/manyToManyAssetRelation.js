/**
* This source file is available under the terms of the
* Pimcore Open Core License (POCL)
* Full copyright and license information is available in
* LICENSE.md which is distributed with this source code.
*
*  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.com)
*  @license    Pimcore Open Core License (POCL)
*/

pimcore.registerNS("pimcore.object.tags.manyToManyAssetRelation");
/**
 * @private
 */
pimcore.object.tags.manyToManyAssetRelation = Class.create(pimcore.object.tags.manyToManyRelation, {

    type: "manyToManyAssetRelation",
    idProperty: "id",

    initialize: function (data, fieldConfig) {
        this.data = data || [];
        this.fieldConfig = fieldConfig;

        // Parent manyToManyRelation unconditionally filters fieldConfig.classes;
        // asset-only backends don't serialize it, so normalize to avoid a TypeError
        // when inherited methods (e.g. dndAllowed, openSearchEditor) run.
        this.fieldConfig.classes = this.fieldConfig.classes || [];

        let visibleFields = [];
        if (Ext.isString(fieldConfig.visibleFields)) {
            visibleFields = fieldConfig.visibleFields.split(",").map(function (field) {
                return field.trim();
            });
        } else if (Ext.isArray(fieldConfig.visibleFields)) {
            visibleFields = fieldConfig.visibleFields;
        }

        this.visibleFields = visibleFields.filter(function (field) {
            return field.length > 0;
        });

        // Dedicated model so visibleField values survive into records (the parent's
        // shared ObjectsMultihrefEntry model has a fixed field list and strips unknown
        // keys) and so idProperty is not dictated by whichever instance happens to
        // register the shared model first.
        var fields = ['id', 'fullpath', 'type', 'subtype', 'published', 'rowId']
            .concat(this.visibleFields);

        var modelName = 'AssetsManyToManyEntry';
        if (!Ext.ClassManager.isCreated(modelName)) {
            Ext.define(modelName, {
                extend: 'Ext.data.Model',
                idProperty: this.idProperty,
                fields: fields
            });
        }

        this.store = new Ext.data.JsonStore({
            data: this.data,
            model: modelName,
            listeners: {
                add: function () {
                    this.dataChanged = true;
                }.bind(this),
                remove: function () {
                    this.dataChanged = true;
                }.bind(this),
                clear: function () {
                    this.dataChanged = true;
                }.bind(this)
            }
        });
    },

    getVisibleColumns: function () {
        var visibleFields = this.visibleFields || [];

        if (visibleFields.length === 0) {
            // Drop the always-"asset" type column from the inherited defaults.
            var cols = pimcore.object.tags.manyToManyRelation.prototype.getVisibleColumns.call(this);
            return cols.filter(function (c) { return c.dataIndex !== 'type'; });
        }

        var columns = [];

        for (var i = 0; i < visibleFields.length; i++) {
            var key = visibleFields[i];
            var layout = (this.fieldConfig.visibleFieldDefinitions || {})[key] || {fieldtype: "input", title: key, name: key};

            var field = {
                key: key,
                label: layout.title === "fullpath" ? t("reference") : layout.title,
                layout: layout
            };

            var tagClass = pimcore.object.tags[field.layout.fieldtype];
            if (!tagClass) {
                continue;
            }

            var fc = tagClass.prototype.getGridColumnConfig(field);

            fc.flex = 1;
            fc.hidden = false;
            fc.layout = field;
            fc.editor = null;
            fc.sortable = false;

            if (fc.layout.key === "fullpath") {
                fc.renderer = this.fullPathRenderCheck.bind(this);
            } else if (fc.layout.layout.fieldtype === 'select'
                || fc.layout.layout.fieldtype === 'multiselect'
                || fc.layout.layout.fieldtype === 'booleanSelect') {
                fc.layout.layout.options.forEach(function (option) {
                    option.key = t(option.key);
                });
            }

            fc.filter = {
                type: 'list',
                labelField: field.key,
                idField: field.key,
                store: this.getSortedStore(this.store, field.key)
            };

            var columnWidth = this.getColumnWidth(fc.dataIndex);
            if (columnWidth > 0) {
                fc.width = columnWidth;
                delete fc.flex;
            }

            if(typeof fc.listeners === "undefined") {
                fc.listeners = {};
            }
            fc.listeners.resize = function (columnKey, column, width) {
                localStorage.setItem(this.getColumnWidthLocalStorageKey(columnKey), width);
            }.bind(this, fc.dataIndex);

            columns.push(fc);
        }

        return columns;
    },

    requestNicePathData: function (targets) {
        if (!this.object) {
            return;
        }

        var context = this.getContext();
        var fields = this.visibleFields || [];
        var loadEditModeData = fields.length > 0;

        pimcore.helpers.requestNicePathData(
            {
                type: "object",
                id: this.object.id
            },
            targets,
            {
                idProperty: this.idProperty,
                pathProperty: this.pathProperty,
                loadEditModeData: loadEditModeData
            },
            this.fieldConfig,
            context,
            pimcore.helpers.requestNicePathDataGridDecorator.bind(this, this.component.getView()),
            pimcore.helpers.getNicePathHandlerStore.bind(this, this.store, {
                idProperty: this.idProperty,
                pathProperty: this.pathProperty,
                loadEditModeData: loadEditModeData,
                fields: fields
            }, this.component.getView())
        );
    }
});
