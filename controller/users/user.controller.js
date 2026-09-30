const User = require('../../models/User');


module.exports.getUserProfile = (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;

        User.findById(userId)
            .then(user => {
                if (!user) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const safeUser = {
                    id: user._id,
                    email: user.email,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                };

                return res.status(200).json(safeUser);
            })
            .catch(error => {
                console.error('Error fetching user profile:', error);
                return res.status(500).json({ error: 'Internal server error' });
            });

    } catch (error) {
        console.error('Error getting user profile:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }

}
