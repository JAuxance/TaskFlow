def get_direct_message_room(user_a_id, user_b_id):
    first_user_id = min(user_a_id, user_b_id)
    second_user_id = max(user_a_id, user_b_id)
    return f"direct_message_{first_user_id}_{second_user_id}"
