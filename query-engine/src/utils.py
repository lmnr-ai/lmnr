from sqlglot import exp

def flatten_conditions(node):
    """Recursively flatten AND conditions to get all individual conditions"""
    if isinstance(node, exp.And):
        conditions = []
        for condition in node.flatten():
            conditions.extend(flatten_conditions(condition))
        return conditions
    else:
        return [node]