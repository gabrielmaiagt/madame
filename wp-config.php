<?php
define( 'WP_CACHE', true );


/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the web site, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * Localized language
 * * ABSPATH
 *
 * @link https://wordpress.org/support/article/editing-wp-config-php/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'u369122917_siteantigo' );

/** Database username */
define( 'DB_USER', 'u369122917_userantigo' );

/** Database password */
define( 'DB_PASSWORD', 'user231082005aA.' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',          '(FLVSLq|>:usa46C=2xPjcFFg8D`V%i!kBTX-AhT2UHhIY-S;d! oY`{2xEafIN%' );
define( 'SECURE_AUTH_KEY',   '8.MS}r4/m$Kmui&fL4*mDu<{}a,h>yh2wv)>vzq6;,O#ckPN<1 x*VqY9Kv8.D>^' );
define( 'LOGGED_IN_KEY',     'E*^?HIx5_h()ue+T,Q#}y.^-Yn`glTw&@=*OM&tLGUAo$&0mz[/vtPK:|[D5hVp!' );
define( 'NONCE_KEY',         '.j2iW(eDh`I~DL7D+nD/-2V1b1sqG13vT2DirJgwJ$FmI>*BS>xgl Va4+iy/yv]' );
define( 'AUTH_SALT',         '|E}p6(m97MMDmy^r>q(s@1P##GP1#iDc!n9o O_W@TGAZ~?s-Ju`3>R!!qImrANa' );
define( 'SECURE_AUTH_SALT',  '-+nV/Kh,x^AnB f/0[[OLA9dwfZp|^t:;{Ylb]v6(Kl_iqP6;/,5w*]<M0R4Qyk!' );
define( 'LOGGED_IN_SALT',    '<*`{cdlAA?[~GYMOMmteh4aXBT_s0Lu[ydJ1Ni< Eu%M`k6z?EuSIWw,s1:Buo%[' );
define( 'NONCE_SALT',        'I-sw7JY@>7k6oa|zs!5!*70p8nr!l )qPCB,y,*mP4s*UfN6;AM,kh?%T4K16g>v' );
define( 'WP_CACHE_KEY_SALT', 'p6CWsrzW~&7_IX4z;6>]_;i*V^;J.5uIo|ypC#cTN/WR:HvxP^}WBA20V-VaxQwA' );


/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';


/* Add any custom values between this line and the "stop editing" line. */



/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/support/article/debugging-in-wordpress/
 */
if ( ! defined( 'WP_DEBUG' ) ) {
	define( 'WP_DEBUG', false );
}

define( 'FS_METHOD', 'direct' );
define( 'COOKIEHASH', '5b5e895e0c3ba7dc8f4a69d7d350743f' );
define( 'WP_AUTO_UPDATE_CORE', 'minor' );
/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
