"""
If you define any type in this file, make sure to re-import it in server.py,
because executed code needs to see the type definitions.
"""


class ChatMessage:
    role: str
    content: str  # TODO: support list[ChatMessageContentPart] later

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content
