/**
* This source file is available under the terms of the
* Pimcore Open Core License (POCL)
* Full copyright and license information is available in
* LICENSE.md which is distributed with this source code.
*
*  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.com)
*  @license    Pimcore Open Core License (POCL)
*/

pimcore.registerNS("pimcore.object.tags.advancedManyToManyAssetRelation");
/**
 * @private
 */
pimcore.object.tags.advancedManyToManyAssetRelation = Class.create(pimcore.object.tags.manyToManyAssetRelation, {

    type: "advancedManyToManyAssetRelation",
    dataChanged: false,
    idProperty: "rowId",
    pathProperty: "fullpath",
    allowBatchAppend: true,
    allowBatchRemove: true,

    initialize: function (data, fieldConfig) {
        this.data = [];
        this.fieldConfig = fieldConfig;

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

        if (data) {
            this.data = data;
        }

        var fields = [];
        fields.push({name: "id"});
        fields.push({name: "index"});
        fields.push({name: "inheritedFields"});
        fields.push({name: "metadata"});
        fields.push({name: "type"});
        fields.push({name: "subtype"});
        fields.push({name: "published"});

        var i;

        for (i = 0; i < this.visibleFields.length; i++) {
            fields.push({name: this.visibleFields[i]});
        }

        for (i = 0; i < this.fieldConfig.columns.length; i++) {
            let defaultValue = null;
            switch(this.fieldConfig.columns[i].type.toLowerCase()){
            case "bool":
            case "columnbool":
                defaultValue = this.fieldConfig.columns[i].value ? (this.fieldConfig.columns[i].value).toLowerCase() == "true" : null;
                break;
            case "text":
            case "number":
                defaultValue = this.fieldConfig.columns[i].value;
                break;
            }
            fields.push({name: this.fieldConfig.columns[i].key, defaultValue: defaultValue});
        }

        var modelName = 'AssetsAdvancedRelations';
        if (!Ext.ClassManager.isCreated(modelName)) {
            Ext.define(modelName, {
                extend: 'Ext.data.Model',
                idProperty: this.idProperty,
                fields: fields
            });
        }

        this.store = new Ext.data.JsonStore({
            data: this.data,
            listeners: {
                add: function () {
                    this.dataChanged = true;
                }.bind(this),
                remove: function () {
                    this.dataChanged = true;
                }.bind(this),
                clear: function () {
                    this.dataChanged = true;
                }.bind(this),
                update: function (store) {
                    if (store.ignoreDataChanged) {
                        return;
                    }
                    this.dataChanged = true;
                }.bind(this)
            },
            model: modelName
        });
    },

    createLayout: function (readOnly) {
        var autoHeight = false;
        if (!this.fieldConfig.height) {
            autoHeight = true;
        }

        let visibleFields = this.visibleFields || [];
        let columns = [];

        if (visibleFields.length === 0) {
            columns.push(
                {text: 'ID', dataIndex: 'id', width: 50},
                {
                    text: t("reference"),
                    dataIndex: 'fullpath',
                    flex: 200,
                    renderer: this.fullPathRenderCheck.bind(this)
                },
                {text: t("type"), dataIndex: 'type', width: 100},
                {text: t("subtype"), dataIndex: 'subtype', width: 100}
            );
        }

        for (let i = 0; i < visibleFields.length; i++) {
            if (!empty(this.fieldConfig.visibleFieldDefinitions) && !empty(visibleFields[i])) {
                let layout = this.fieldConfig.visibleFieldDefinitions[visibleFields[i]];

                let field = {
                    key: visibleFields[i],
                    label: layout.title == "fullpath" ? t("reference") : layout.title,
                    layout: layout,
                    position: i,
                    type: layout.fieldtype
                };

                let fc = pimcore.object.tags[layout.fieldtype].prototype.getGridColumnConfig(field);

                let columnWidth = this.getColumnWidth(visibleFields[i]);
                if (columnWidth > 0) {
                    fc.width = columnWidth;
                } else {
                    fc.flex = 1;
                }

                fc.hidden = false;
                fc.layout = field;
                fc.editor = null;
                fc.sortable = false;

                if (fc.layout.key === "fullpath") {
                    fc.renderer = this.fullPathRenderCheck.bind(this);
                } else if (fc.layout.layout.fieldtype == 'select'
                    || fc.layout.layout.fieldtype == 'multiselect'
                    || fc.layout.layout.fieldtype == 'booleanSelect') {
                    fc.layout.layout.options.forEach(option => {
                        option.key = t(option.key);
                    });
                }

                fc.filter = {
                    type: 'list'
                };

                if (fc.layout.layout.fieldtype === 'checkbox' || fc.layout.key === 'published') {
                    fc.filter.type = 'boolean';
                } else {
                    fc.filter.labelField = visibleFields[i];
                    fc.filter.idField = visibleFields[i];
                    fc.filter.store = this.getSortedStore(this.store, visibleFields[i]);
                }

                columns.push(fc);
            }
        }

        for (i = 0; i < this.fieldConfig.columns.length; i++) {
            let width = 100;
            if (this.fieldConfig.columns[i].width) {
                width = this.fieldConfig.columns[i].width;
            } else {
                let columnWidth = this.getColumnWidth(this.fieldConfig.columns[i].key);
                if(columnWidth > 0) {
                    width = columnWidth;
                }
            }

            let cellEditor = null;
            let renderer = null;
            let listeners = {};

            let filterType = 'list';
            if (this.fieldConfig.columns[i].type == "number") {
                if(!readOnly) {
                    cellEditor = function() {
                        return new Ext.form.NumberField({});
                    }.bind();
                }

                renderer = Ext.util.Format.numberRenderer();
            } else if (this.fieldConfig.columns[i].type == "text" && !readOnly) {
                cellEditor = function() {
                    return new Ext.form.TextField({});
                };
            } else if (this.fieldConfig.columns[i].type == "select") {
                if(!readOnly) {
                    var selectData = [];

                    if (this.fieldConfig.columns[i].value) {
                        var selectDataRaw = this.fieldConfig.columns[i].value.split(";");

                        for (var j = 0; j < selectDataRaw.length; j++) {
                            selectData.push([selectDataRaw[j], t(selectDataRaw[j])]);
                        }
                    }

                    cellEditor = function(selectData) {
                        return new Ext.form.ComboBox({
                            typeAhead: true,
                            queryDelay: 0,
                            queryMode: "local",
                            forceSelection: true,
                            triggerAction: 'all',
                            lazyRender: false,
                            mode: 'local',

                            store: new Ext.data.ArrayStore({
                                fields: [
                                    'value',
                                    'label'
                                ],
                                data: selectData
                            }),
                            valueField: 'value',
                            displayField: 'label'
                        });
                    }.bind(this, selectData);
                }

                renderer = function (value, metaData, record, rowIndex, colIndex, store) {
                    return t(value);
                }
            } else if (this.fieldConfig.columns[i].type == "multiselect") {
                if (!readOnly) {
                    cellEditor = function (fieldInfo) {
                        return new pimcore.object.helpers.metadataMultiselectEditor({
                            fieldInfo: fieldInfo
                        });
                    }.bind(this, this.fieldConfig.columns[i]);
                }

                renderer = function (value, metaData, record, rowIndex, colIndex, store) {
                    if (Ext.isString(value)) {
                        value = value.split(',');
                    }

                    if (Ext.isArray(value)) {
                        return value.map(function (str) {
                            return t(str);
                        }).join(',')
                    } else {
                        return value;
                    }
                }
            } else if (this.fieldConfig.columns[i].type == "bool" || this.fieldConfig.columns[i].type == "columnbool") {
                renderer = function (value, metaData, record, rowIndex, colIndex, store) {
                    if (this.fieldConfig.noteditable) {
                        metaData.tdCls += ' grid_cbx_noteditable';
                    }

                    return Ext.String.format('<div style=\"text-align: center\"><div role=\"button\" class=\"x-grid-checkcolumn {0}\" style=\"\"></div></div>', value ? 'x-grid-checkcolumn-checked' : '');
                }.bind(this);

                listeners = {
                    "mousedown": this.cellMousedown.bind(this, this.fieldConfig.columns[i].key, this.fieldConfig.columns[i].type, readOnly)
                };

                filterType = 'boolean';

                if (readOnly) {
                    columns.push(Ext.create('Ext.grid.column.Check', {
                        text: t(this.fieldConfig.columns[i].label),
                        dataIndex: this.fieldConfig.columns[i].key,
                        width: width,
                        renderer: renderer,
                        filter: {
                            type: filterType
                        }
                    }));
                    continue;
                }
            }

            var columnConfig = {
                text: t(this.fieldConfig.columns[i].label),
                dataIndex: this.fieldConfig.columns[i].key,
                renderer: renderer,
                listeners: listeners,
                width: width,
                filter: {
                    type: filterType
                }
            };

            if (filterType === 'list') {
                columnConfig.filter.labelField = this.fieldConfig.columns[i].key;
                columnConfig.filter.idField = this.fieldConfig.columns[i].key;
                columnConfig.filter.store = this.getSortedStore(this.store, this.fieldConfig.columns[i].key);
            }

            if (cellEditor) {
                columnConfig.getEditor = cellEditor;
            }

            columns.push(columnConfig);
        }

        columns = Ext.Array.map(columns, function(column) {
            if(typeof column.listeners === "undefined") {
                column.listeners = {};
            }
            column.listeners.resize = function (columnKey, column, width) {
                localStorage.setItem(this.getColumnWidthLocalStorageKey(columnKey), width);
            }.bind(this, column.dataIndex);

            return column;
        }.bind(this));

        if (!readOnly) {
            columns.push({
                xtype: 'actioncolumn',
                menuText: t('up'),
                width: 40,
                hideable: false,
                items: [
                    {
                        tooltip: t('up'),
                        icon: "/bundles/pimcoreadmin/img/flat-color-icons/up.svg",
                        handler: function (grid, rowIndex) {
                            if (rowIndex > 0) {
                                var rec = grid.getStore().getAt(rowIndex);
                                grid.getStore().removeAt(rowIndex);
                                grid.getStore().insert(rowIndex - 1, [rec]);
                            }
                        }.bind(this)
                    }
                ]
            });
            columns.push({
                xtype: 'actioncolumn',
                menuText: t('down'),
                width: 40,
                hideable: false,
                items: [
                    {
                        tooltip: t('down'),
                        icon: "/bundles/pimcoreadmin/img/flat-color-icons/down.svg",
                        handler: function (grid, rowIndex) {
                            if (rowIndex < (grid.getStore().getCount() - 1)) {
                                var rec = grid.getStore().getAt(rowIndex);
                                grid.getStore().removeAt(rowIndex);
                                grid.getStore().insert(rowIndex + 1, [rec]);
                            }
                        }.bind(this)
                    }
                ]
            });
        }

        columns.push({
            xtype: 'actioncolumn',
            menuText: t('open'),
            width: 40,
            hideable: false,
            items: [
                {
                    tooltip: t('open'),
                    icon: "/bundles/pimcoreadmin/img/flat-color-icons/open_file.svg",
                    handler: function (grid, rowIndex) {
                        const data = grid.getStore().getAt(rowIndex);
                        pimcore.helpers.openElement(data.data.id, "asset", data.data.subtype);
                    }.bind(this)
                }
            ]
        });

        if (this.fieldConfig.assetInlineDownloadAllowed) {
            columns.push({
                xtype: 'actioncolumn',
                menuText: t('download'),
                width: 40,
                sortable: false,
                items: [
                    {
                        tooltip: t('download'),
                        icon: "/bundles/pimcoreadmin/img/flat-color-icons/download-cloud.svg",
                        handler: function (grid, rowIndex) {
                            const data = grid.getStore().getAt(rowIndex);
                            if (data.data.id && data.data.type && data.data.type === "asset") {
                                if (data.data.subtype === "folder") {
                                    pimcore.elementservice.downloadAssetFolderAsZip(data.data.id)
                                } else {
                                    pimcore.helpers.download(Routing.generate('pimcore_admin_asset_download', {id: data.data.id}));
                                }
                            }
                        }.bind(this)
                    }
                ]
            })
        }

        if (!readOnly) {
            columns.push({
                xtype: 'actioncolumn',
                menuText: t('remove'),
                width: 40,
                hideable: false,
                items: [
                    {
                        tooltip: t('remove'),
                        icon: "/bundles/pimcoreadmin/img/flat-color-icons/delete.svg",
                        handler: function (grid, rowIndex) {
                            let data = grid.getStore().getAt(rowIndex);
                            pimcore.helpers.deleteConfirm(t('relation'), data.data.fullpath, function () {
                                grid.getStore().removeAt(rowIndex);
                            }.bind(this));
                        }.bind(this)
                    }
                ]
            });
        }

        let toolbarItems = this.getEditToolbarItems(readOnly);

        this.cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 1,
            listeners: {
                beforeedit: function (editor, context, eOpts) {
                    editor.editors.each(function (e) {
                        try {
                            e.completeEdit();
                            Ext.destroy(e);
                        } catch (exception) {
                        }
                    });

                    editor.editors.clear();
                }
            }
        });


        this.component = Ext.create('Ext.grid.Panel', {
            store: this.store,
            border: true,
            style: "margin-bottom: 10px",
            enableDragDrop: true,
            ddGroup: 'element',
            trackMouseOver: true,
            selModel: {
                selType: (this.fieldConfig.enableBatchEdit ? 'checkboxmodel' : 'rowmodel')
            },
            multiSelect: true,
            columnLines: true,
            stripeRows: true,
            columns: {
                defaults: {
                    sortable: false
                },
                items: columns
            },
            viewConfig: {
                plugins: {
                    ptype: 'gridviewdragdrop',
                    draggroup: 'element'
                },
                markDirty: false,
                enableTextSelection: this.fieldConfig.enableTextSelection,
                listeners: {
                    afterrender: function (gridview) {
                        this.requestNicePathData(this.store.data, true);
                    }.bind(this),
                    drop: function () {
                        this.dataChanged = true;

                        if (this.object.toolbar && this.object.toolbar.items && this.object.toolbar.items.items) {
                            this.object.toolbar.items.items[0].focus();
                        }
                    }.bind(this),
                    cellmousedown: function (element, td, cellIndex, record, tr, rowIndex, e, eOpts) {
                        if (this.fieldConfig.noteditable == true || cellIndex >= visibleFields.length) {
                            return false;
                        } else {
                            return true;
                        }
                    }.bind(this)
                }
            },
            componentCls: this.getWrapperClassNames(),
            width: this.fieldConfig.width,
            height: this.fieldConfig.height,
            tbar: {
                items: toolbarItems,
                ctCls: "pimcore_force_auto_width",
                cls: "pimcore_force_auto_width",
                minHeight: 32
            },
            autoHeight: autoHeight,
            bodyCls: "pimcore_object_tag_objects pimcore_editable_grid",
            plugins: [
                this.cellEditing,
                'gridfilters'
            ],
            listeners: {
                celldblclick: function (grid, cell, cellIndex, record) {
                    if (
                        cellIndex >= 0 &&
                        (visibleFields.length === 0 || cellIndex < visibleFields.length)
                    ) {
                        this.gridRowDblClickHandler(grid, record);
                    }
                }.bind(this)
            }
        });

        if (!readOnly) {
            this.component.on("rowcontextmenu", this.onRowContextmenu);
        }

        this.component.reference = this;

        if (!readOnly) {
            this.component.on("afterrender", function () {

                var dropTargetEl = this.component.getEl();
                var gridDropTarget = new Ext.dd.DropZone(dropTargetEl, {
                    ddGroup: 'element',
                    getTargetFromEvent: function (e) {
                        return this.component.getEl().dom;
                    }.bind(this),

                    onNodeOver: function (overHtmlNode, ddSource, e, data) {
                        var returnValue = Ext.dd.DropZone.prototype.dropAllowed;
                        data.records.forEach(function (record) {
                            var fromTree = this.isFromTree(ddSource);
                            if (!this.dndAllowed(record.data, fromTree)) {
                                returnValue = Ext.dd.DropZone.prototype.dropNotAllowed;
                            }
                        }.bind(this));

                        return returnValue;
                    }.bind(this),

                    onNodeDrop: function (target, dd, e, data) {

                        this.nodeElement = data;
                        var fromTree = this.isFromTree(dd);
                        var toBeRequested = new Ext.util.Collection();

                        data.records.forEach(function (record) {
                            var data = record.data;
                            if (this.dndAllowed(data, fromTree)) {
                                if (data["grid"] && data["grid"] == this.component) {
                                    var rowIndex = this.component.getView().findRowIndex(e.target);
                                    if (rowIndex !== false) {
                                        var rec = this.store.getAt(data.rowIndex);
                                        this.store.removeAt(data.rowIndex);
                                        toBeRequested.add(this.store.insert(rowIndex, [rec]));
                                        this.requestNicePathData(toBeRequested);
                                    }
                                } else {
                                    var initData = {
                                        id: data.id,
                                        metadata: '',
                                        inheritedFields: {},
                                        fullpath: data.path,
                                        type: "asset",
                                        subtype: data.type
                                    };

                                    if (this.fieldConfig.allowMultipleAssignments || !this.elementAlreadyExists(initData.id, initData.type)) {
                                        toBeRequested.add(this.store.add(initData));
                                    }
                                }
                            }
                        }.bind(this));

                        if (toBeRequested.length) {
                            this.requestNicePathData(toBeRequested);
                            return true;
                        }

                        return false;

                    }.bind(this)
                });

                if (this.fieldConfig.enableBatchEdit) {
                    let grid = this.component;
                    let menu = grid.headerCt.getMenu();

                    let batchAllMenu = new Ext.menu.Item({
                        text: t("batch_change"),
                        iconCls: "pimcore_icon_table pimcore_icon_overlay_go",
                        handler: function (grid) {
                            var columnDataIndex = menu.activeHeader;
                            this.batchPrepare(columnDataIndex, grid, false, false);
                        }.bind(this, grid)
                    });

                    menu.add(batchAllMenu);

                    let batchSelectedMenu = new Ext.menu.Item({
                        text: t("batch_change_selected"),
                        iconCls: "pimcore_icon_structuredTable pimcore_icon_overlay_go",
                        handler: function (grid) {
                            menu = grid.headerCt.getMenu();
                            var columnDataIndex = menu.activeHeader;
                            this.batchPrepare(columnDataIndex, grid, true, false);
                        }.bind(this, grid)
                    });
                    menu.add(batchSelectedMenu);
                    menu.on('beforeshow', function (batchAllMenu, batchSelectedMenu, grid) {
                        let menu = grid.headerCt.getMenu();
                        let columnDataIndex = menu.activeHeader.dataIndex;
                        let metaIndex = this.fieldConfig.columnKeys.indexOf(columnDataIndex);

                        if (metaIndex < 0) {
                            batchSelectedMenu.hide();
                            batchAllMenu.hide();
                        } else {
                            batchSelectedMenu.show();
                            batchAllMenu.show();
                        }

                    }.bind(this, batchAllMenu, batchSelectedMenu, grid));
                }
            }.bind(this));
        }

        this.addFilterChangeListener();

        return this.component;
    },

    getLayoutEdit: function () {
        return this.createLayout(false);
    },

    getLayoutShow: function () {
        return this.createLayout(true);
    },

    getEditToolbarItems: function (readOnly) {
        var toolbarItems = [
            {
                xtype: "tbspacer",
                width: 24,
                height: 24,
                cls: "pimcore_icon_droptarget"
            },
            {
                xtype: "tbtext",
                text: "<b>" + t(this.fieldConfig.title) + "</b>"
            },
            "->"
        ];

        toolbarItems = toolbarItems.concat(this.getFilterEditToolbarItems());

        if (!readOnly) {
            if (this.fieldConfig.allowToClearRelation) {
                toolbarItems.push({
                    xtype: "button",
                    iconCls: "pimcore_icon_delete",
                    tooltip: t("empty"),
                    handler: function () {
                        pimcore.helpers.deleteConfirm(t('all'), t('relations'), function () {
                            this.empty();
                        }.bind(this));
                    }.bind(this)
                });
            }

            if (this.fieldConfig.assetsAllowed && this.fieldConfig.noteditable == false) {
                toolbarItems.push({
                    xtype: "button",
                    iconCls: "pimcore_icon_upload",
                    tooltip: t("upload"),
                    cls: "pimcore_inline_upload",
                    handler: this.uploadDialog.bind(this)
                });
            }

            if(pimcore.helpers.hasSearchImplementation()) {
                toolbarItems.push({
                    xtype: "button",
                    iconCls: "pimcore_icon_search",
                    tooltip: t("search"),
                    handler: this.openSearchEditor.bind(this)
                });
            }
        }

        return toolbarItems;
    },

    dndAllowed: function (data, fromTree) {
        if (!fromTree) {
            if (data["grid"] && data["grid"] == this.component) {
                return true;
            }
            return false;
        }

        if (data.elementType != "asset") {
            return false;
        }

        var isAllowed = false;
        var subType = data.type;

        if (this.fieldConfig.assetTypes != null && this.fieldConfig.assetTypes.length > 0) {
            for (var i = 0; i < this.fieldConfig.assetTypes.length; i++) {
                if (this.fieldConfig.assetTypes[i].assetTypes == subType) {
                    isAllowed = true;
                    break;
                }
            }
        } else {
            isAllowed = true;
        }

        return isAllowed;
    },

    cellMousedown: function (key, colType, readOnly, grid, cell, rowIndex, cellIndex, e) {

        var store = grid.getStore();
        var record = store.getAt(rowIndex);

        if (colType == "bool") {
            record.set(key, !record.data[key]);
        } else if (!readOnly && colType === "columnbool") {
            if (record.data[key]) {
                grid.getStore().each(function (rec) {
                    if (!!rec.get(key)) {
                        rec.set(key, false);
                    }
                });
            } else {
                record.set(key, !record.data[key]);
            }
        }
    },

    requestNicePathData: function (targets, isInitialLoad) {
        if (!this.object) {
            return;
        }

        var fields = [];
        var context = this.getContext();

        if (this.visibleFields) {
            fields = fields.concat(this.visibleFields);
        }

        if (this.fieldConfig.columnKeys) {
            fields = fields.concat(this.fieldConfig.columnKeys);
        }

        var loadEditModeData = fields.length > 0;

        var nicePathRequested = pimcore.helpers.requestNicePathData(
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

        if (nicePathRequested) {
            window.setTimeout(function () {
                this.component.getView().refresh();
            }.bind(this), 500);
        }
    },

    getGridColumnConfig: function (field) {
        return {
            text: t(field.label), width: 150, sortable: false, dataIndex: field.key,
            getEditor: this.getWindowCellEditor.bind(this, field),
            getRelationFilter: this.getRelationFilter,
            renderer: pimcore.object.helpers.grid.prototype.advancedRelationGridRenderer.bind(this, field, "fullpath")
        };
    },


    getCellEditValue: function () {
        return this.getValue();
    }
});
