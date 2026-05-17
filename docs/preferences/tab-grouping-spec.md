# Tab grouping spec

To make grouping preferences easier for developers and to make preferences easier to view for the user,
we have been considering a tab feature. Tabs would be grouped into panels, and the user can easily select
separate tabs to view a different set of preferences that they can configure.

The `preferences.json` implementation should look something like this:

```json
[
  {
    "type": "panel",
    "tabs": [
      {
        "name": "Sidebar",
        "configs": [
          {
            "type": "checkbox",
            "property": "sidebar.compact",
            "label": "Enable compact sidebar"
          }
        ]
      }
    ]
  }
]
```

Although the implementation would be fairly complex, it seems to be the best method.
The `configs` array will be treated exactly like a separate `preferences.json` file, where you can specify
different configs, including checkboxes, dropdowns, strings, and even separators.
