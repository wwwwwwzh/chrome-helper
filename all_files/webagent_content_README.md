### Pseudocode for dom-parser
```py
global_map

def build_dom_tree(node, parent_iframe=None):
    # Base case: skip null or special highlight container node
    if node is None or node.id == HIGHLIGHT_CONTAINER_ID:
        return None

    # Special handling for <body>
    if node.tag == 'body':
        node_data = {
            'tagName': 'body',
            'attributes': {},
            'xpath': '/body',
            'children': []
        }
        for child in node.child_nodes:
            child_id = build_dom_tree(child, parent_iframe)
            if child_id is not None:
                node_data['children'].append(child_id)
        global_map[unique_id()] = node_data
        return node_data

    # Process text nodes
    if node.type == 'TEXT_NODE':
        text = node.text.strip()
        if not text:
            return None
        node_data = {
            'type': 'TEXT_NODE',
            'text': text,
            'isVisible': check_text_visibility(node)
        }
        global_map[unique_id()] = node_data
        return node_data

    # Skip non-accepted element nodes
    if node.type != 'ELEMENT_NODE' or not is_accepted(node):
        return None

    # Process element node
    node_data = {
        'tagName': node.tag.lower(),
        'attributes': get_attributes(node),
        'xpath': compute_xpath(node),
        'children': []
    }
    
    if is_visible(node) and is_interactive(node):
        node_data['isVisible'] = True
        node_data['highlightIndex'] = get_next_highlight_index()
        highlight_element(node, node_data['highlightIndex'])
    
    # Process children (including iframes and shadow DOM)
    for child in node.child_nodes:
        child_id = build_dom_tree(child, parent_iframe)
        if child_id is not None:
            node_data['children'].append(child_id)

    global_map[unique_id()] = node_data
    return node_data
```