
        from pymol import cmd,stored
        
        set depth_cue, 1
        set fog_start, 0.4
        
        set_color b_col, [36,36,85]
        set_color t_col, [10,10,10]
        set bg_rgb_bottom, b_col
        set bg_rgb_top, t_col      
        set bg_gradient
        
        set  spec_power  =  200
        set  spec_refl   =  0
        
        load "data/protein_for_cavity_detection.pdb", protein
        create ligands, protein and organic
        select xlig, protein and organic
        delete xlig
        
        hide everything, all
        
        color white, elem c
        color bluewhite, protein
        #show_as cartoon, protein
        show surface, protein
        #set transparency, 0.15
        
        show sticks, ligands
        set stick_color, magenta
        
        
        
        
        # SAS points
 
        load "data/protein_for_cavity_detection.pdb_points.pdb.gz", points
        hide nonbonded, points
        show nb_spheres, points
        set sphere_scale, 0.2, points
        cmd.spectrum("b", "green_red", selection="points", minimum=0, maximum=0.7)
        
        
        stored.list=[]
        cmd.iterate("(resn STP)","stored.list.append(resi)")    # read info about residues STP
        lastSTP=stored.list[-1] # get the index of the last residue
        hide lines, resn STP
        
        cmd.select("rest", "resn STP and resi 0")
        
        for my_index in range(1,int(lastSTP)+1): cmd.select("pocket"+str(my_index), "resn STP and resi "+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.show("spheres","pocket"+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.set("sphere_scale","0.4","pocket"+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.set("sphere_transparency","0.1","pocket"+str(my_index))
        
        
        
        set_color pcol1 = [0.361,0.576,0.902]
select surf_pocket1, protein and id [2791,2792,2997,2807,3017,3020,3031,3032,3051,2786,2788,2789,2790,2798,2797,2801,2803,2805,2796,4078,4082,4080,4091,4130,4131,4133,2775,4211,3210,3233,3245,3019,3021,3022,3023,3053,3054,3247,3248,4173,4176,4178,4181,4165,3209,4169,4089,4092,4128,4075,4077,1004,1006,4079,4081,4127,3207,3188,3090,3235,3236,3237,3238,3239,3091,3089,2811,2826,312,311,313,2829,2830,2831,2833,2832,3182,3186,3116,3174,3187,3173,3147,3150,3151,3152,3153,3176,3177,3180,3120,3121,550,285,2843,2846,2855,2856,3295,2987,2990,3293,3582,4218,3303,3581,4247,3272,3273,3296,3292,2207,2210,2223,2225,3600,2214,4070,2195,2199,2222,2224,2961,2993,2998,1143,1169,1138,1140,2198,1134,3555,2246,3544,3572,3574,3575,2245,3545,3546,3554,3518,2956,2362,2955,2218,2219,2220,2177,2173,2169,1166,1168,1170,1199,2253,1167,2254,2958,2960,2962,2963,2964,2357,2361,3512,3514] 
set surface_color,  pcol1, surf_pocket1 
set_color pcol2 = [0.278,0.353,0.702]
select surf_pocket2, protein and id [5469,5472,5474,5475,3980,3982,5473,5455,5464,5429,5438,5468,5435,5439,5449,5592,5605,5606,5607,5608,5610,5482,5483,5486,5487,5488,5555,5556,5477,5479,5481,5554,5485,3963,4986,4965,4967,4984,5625,5622,5623,1285,5627,1062,5609,1058,4941,4944,4946,4936,4937,4939,3910,3913,3990,3996,3997,3999,4001,4003,4029,1386,5437,3837,3838,5493,3836,3834,5496,5489,5492,3827,3866,3869,3986,3983,1319,1355,1357,1317,1322,1324,1326,1363,1364,1043,1047,1365,3835,3877,3882,3884,3865,3878,3909,3832,1039,5173,5199,5205,5239,5240,5243,5433,5201,5175,5197,4991,5012,4988,4990,4018,4019,3796,4009,4011,4004,5176,5172] 
set surface_color,  pcol2, surf_pocket2 
set_color pcol3 = [0.388,0.361,0.902]
select surf_pocket3, protein and id [1578,1689,1660,1685,1703,1697,4560,4557,4558,4559,1696,4577,4569,4571,4576,1691,1695,4581,785,783,784,786,1700,1701,759,760,4556,756,816,757,817,787,788,790,3169,3158,1658,1659,1661,1662,1665,1667,3197,4589] 
set surface_color,  pcol3, surf_pocket3 
set_color pcol4 = [0.396,0.278,0.702]
select surf_pocket4, protein and id [1628,1631,1527,833,930,817,827,830,835,1638,1642,1502,1607,952,4121,1624,1636,1661,1664,1666,1667,4137,4118,4134,3209,3214,4169,4128] 
set surface_color,  pcol4, surf_pocket4 
set_color pcol5 = [0.631,0.361,0.902]
select surf_pocket5, protein and id [4970,4972,5650,5633,5646,5005,4971,2073,2070,1239,1242,2075,2077,1250,2067,2080,3969,1278] 
set surface_color,  pcol5, surf_pocket5 
set_color pcol6 = [0.584,0.278,0.702]
select surf_pocket6, protein and id [3901,3902,3875,3859,2138,2190,1348,1351,2187,2189,4041,3861,4047,4050,4042,2192] 
set surface_color,  pcol6, surf_pocket6 
set_color pcol7 = [0.875,0.361,0.902]
select surf_pocket7, protein and id [2962,2963,2964,2373,2387,2945,2947,2386,2245,3545,3546,2266,2244,2269,2356] 
set surface_color,  pcol7, surf_pocket7 
set_color pcol8 = [0.702,0.278,0.627]
select surf_pocket8, protein and id [4414,3351,3373,3375,4426,4435,3382,2544,2577,2579,4436,2540,2545,2546,2541,2542,2543] 
set surface_color,  pcol8, surf_pocket8 
set_color pcol9 = [0.902,0.361,0.682]
select surf_pocket9, protein and id [4890,4855,4859,2037,1978,2012,2013,2004,4854,4867] 
set surface_color,  pcol9, surf_pocket9 
set_color pcol10 = [0.702,0.278,0.439]
select surf_pocket10, protein and id [5517,5518,5044,5537,5535,5519,5520,5523,5516,5030,5503,5505,5500,5031,5046,5049] 
set surface_color,  pcol10, surf_pocket10 
set_color pcol11 = [0.902,0.361,0.439]
select surf_pocket11, protein and id [213,224,252,743,186,188,189,768,769,3141,735] 
set surface_color,  pcol11, surf_pocket11 
set_color pcol12 = [0.702,0.310,0.278]
select surf_pocket12, protein and id [1485,3783,3788,3790,3772,3732,3739,3755,3756,3821,1477,1509,1480] 
set surface_color,  pcol12, surf_pocket12 
set_color pcol13 = [0.902,0.522,0.361]
select surf_pocket13, protein and id [4293,4380,4313,4348,4350,4312,4295,4323,4321,4292,4316,4317,4368,4366,4375,4377,4742,4374,4743] 
set surface_color,  pcol13, surf_pocket13 
set_color pcol14 = [0.702,0.502,0.278]
select surf_pocket14, protein and id [2720,2739,1140,2765,2769,2777,2780,2782,2719,2731,2751,2757] 
set surface_color,  pcol14, surf_pocket14 
set_color pcol15 = [0.902,0.765,0.361]
select surf_pocket15, protein and id [1270,2251,2262,1200,1213,1222,2053,2055,2287] 
set surface_color,  pcol15, surf_pocket15 
set_color pcol16 = [0.702,0.690,0.278]
select surf_pocket16, protein and id [1618,1769,1777,1763,1765,1766,1586,1776,1688,1778] 
set surface_color,  pcol16, surf_pocket16 
   
        
        deselect
        
        orient
        