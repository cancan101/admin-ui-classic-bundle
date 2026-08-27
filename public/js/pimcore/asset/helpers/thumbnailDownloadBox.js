/**
* This source file is available under the terms of the
* Pimcore Open Core License (POCL)
* Full copyright and license information is available in
* LICENSE.md which is distributed with this source code.
*
*  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.com)
*  @license    Pimcore Open Core License (POCL)
*/

pimcore.registerNS("pimcore.asset.helpers.thumbnailDownloadBox");
/**
 * Reusable "Download Thumbnail" / "Custom Download" side panels.
 *
 * Every asset type which is able to render an image thumbnail (image, document, video) can use them,
 * the generated thumbnail is always requested from pimcore_admin_asset_downloadimagethumbnail.
 *
 * @private
 */
pimcore.asset.helpers.thumbnailDownloadBox = Class.create({

    /**
     * @param {Object} config
     * @param {number} config.assetId
     * @param {number} [config.defaultWidth] pre-filled width of the custom download form
     * @param {boolean} [config.exiftoolAvailable] enables the DPI field
     * @param {Function} [config.getAdditionalFields] returns additional Ext field configs which are rendered
     *                                               on top of both forms (e.g. the page of a document)
     * @param {Array} [config.additionalParamNames] names of the additional fields which are passed to the
     *                                              download route as separate parameters
     */
    initialize: function (config) {
        this.config = Ext.apply({
            defaultWidth: 800,
            exiftoolAvailable: false,
            additionalParamNames: []
        }, config || {});
    },

    /**
     * @returns {Array} the panels to be added to the details section of an asset editor
     */
    getPanels: function () {
        return [this.getThumbnailDownloadBox(), this.getCustomDownloadBox()];
    },

    getAdditionalFields: function () {
        if (typeof this.config.getAdditionalFields === "function") {
            return this.config.getAdditionalFields();
        }

        return [];
    },

    /**
     * Splits the form values into route parameters (id + additional ones like page/time) and the
     * remaining values which describe the thumbnail itself.
     */
    extractRouteParams: function (values) {
        var params = {id: this.config.assetId};

        Ext.each(this.config.additionalParamNames, function (name) {
            if (!Ext.isEmpty(values[name])) {
                params[name] = values[name];
            }
            delete values[name];
        });

        return params;
    },

    getThumbnailDownloadBox: function () {
        if (this.thumbnailDownloadBox) {
            return this.thumbnailDownloadBox;
        }

        var thumbnailsStore = new Ext.data.JsonStore({
            autoLoad: false,
            autoDestroy: true,
            proxy: {
                type: 'ajax',
                url: Routing.generate('pimcore_admin_settings_thumbnaildownloadable')
            },
            fields: ['id']
        });

        this.thumbnailDownloadBox = new Ext.form.FormPanel({
            title: t("download_thumbnail"),
            bodyStyle: "padding: 10px;",
            style: "margin: 10px 0",
            items: [{
                xtype: "combo",
                name: "thumbnail",
                fieldLabel: t("thumbnail"),
                store: thumbnailsStore,
                editable: false,
                displayField: "id"
            }].concat(this.getAdditionalFields()),
            buttons: [{
                text: t("download"),
                iconCls: "pimcore_icon_download",
                handler: function () {
                    var values = this.thumbnailDownloadBox.getForm().getFieldValues();
                    var params = this.extractRouteParams(values);

                    if (!values.thumbnail) {
                        pimcore.helpers.showNotification(t("error"), t("no_thumbnail_selected"), "error");
                        return;
                    }

                    params.thumbnail = values.thumbnail;
                    pimcore.helpers.download(
                        Routing.generate('pimcore_admin_asset_downloadimagethumbnail', params)
                    );
                }.bind(this)
            }]
        });

        return this.thumbnailDownloadBox;
    },

    getCustomDownloadBox: function () {
        if (this.customDownloadBox) {
            return this.customDownloadBox;
        }

        var exiftoolAvailable = this.config.exiftoolAvailable;

        this.customDownloadBox = new Ext.form.FormPanel({
            title: t("custom_download"),
            bodyStyle: "padding: 10px;",
            style: "margin: 10px 0 10px 0",
            items: [{
                xtype: "combo",
                triggerAction: "all",
                name: "format",
                fieldLabel: t("format"),
                store: [["JPEG", "JPEG"], ["PNG", "PNG"]],
                mode: "local",
                value: "JPEG",
                editable: false,
                listeners: {
                    select: function (el) {
                        if (exiftoolAvailable) {
                            var dpiField = this.customDownloadBox.getComponent("dpi");
                            if (el.getValue() == "JPEG") {
                                dpiField.enable();
                            } else {
                                dpiField.disable();
                            }
                        }
                    }.bind(this)
                }
            }, {
                xtype: "combo",
                triggerAction: "all",
                name: "resize_mode",
                itemId: "resize_mode",
                fieldLabel: t("mode"),
                forceSelection: true,
                store: [["scaleByWidth", t("scalebywidth")], ["scaleByHeight", t("scalebyheight")], ["resize", t("resize")]],
                mode: "local",
                value: "scaleByWidth",
                editable: false,
                listeners: {
                    select: function (el) {
                        var widthField = this.customDownloadBox.getComponent("width");
                        var heightField = this.customDownloadBox.getComponent("height");

                        if (el.getValue() == "scaleByWidth") {
                            widthField.enable();
                            heightField.disable();
                        } else if (el.getValue() == "scaleByHeight") {
                            widthField.disable();
                            heightField.enable();
                        } else {
                            widthField.enable();
                            heightField.enable();
                        }
                    }.bind(this)
                }
            }, {
                xtype: "numberfield",
                name: "width",
                itemId: "width",
                fieldLabel: t("width"),
                value: this.config.defaultWidth
            }, {
                xtype: "numberfield",
                name: "height",
                itemId: "height",
                fieldLabel: t("height"),
                disabled: true
            }, {
                xtype: "numberfield",
                name: "quality",
                fieldLabel: t("quality"),
                emptyText: t("source")
            }, {
                xtype: "numberfield",
                name: "dpi",
                itemId: "dpi",
                fieldLabel: "DPI",
                emptyText: t("source"),
                disabled: !exiftoolAvailable
            }].concat(this.getAdditionalFields()),
            buttons: [{
                text: t("download"),
                iconCls: "pimcore_icon_download",
                handler: function () {
                    var values = this.customDownloadBox.getForm().getFieldValues();
                    var params = this.extractRouteParams(values);

                    params.config = Ext.encode(values);
                    pimcore.helpers.download(
                        Routing.generate('pimcore_admin_asset_downloadimagethumbnail', params)
                    );
                }.bind(this)
            }]
        });

        return this.customDownloadBox;
    }
});
